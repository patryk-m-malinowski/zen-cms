/* ************************************************************************


 *
 *  Zen [and the art of] CMS
 *
 *  https://zenesis.com
 *
 *  Copyright:
 *    2019-2025 Zenesis Ltd, https://www.zenesis.com
 *
 *  License:
 *    MIT (see LICENSE in project root)
 *
 *  Authors:
 *    John Spackman (@johnspackman)
 *    Will Johnson (@willsterjohnsonatzenesis)
 *
 * ************************************************************************ */

const path = require("path");
const fs = require("fs");

/**
 * A worker pool maintains and manages a pool of workers
 *
 * Implementations of this class is responsible to creating and destroying those
 * processes, allocating work to them, and communicating with the scheduler to
 * receive work to do and report back the status of the work to the scheduler.
 *
 * @ignore(queueMicrotask)
 */
qx.Class.define("zx.server.work.pools.WorkerPool", {
  extend: qx.core.Object,
  implement: [zx.utils.IPoolFactory, zx.server.work.pools.IWorkerPoolApi],

  construct(workdir) {
    super();

    if (!workdir) {
      const DF = new qx.util.format.DateFormat("yyyy-MM-dd");
      workdir = zx.server.Config.resolveTemp("worker-pools/" + DF.format(new Date()) + "/" + this.classname);
    }
    this.setWorkDir(workdir);

    this.__runningWorkTrackers = {};
    this.__workResultQueue = [];

    this.__apiPath = "/workers/pools/" + this.classname;
    this.__serverApi = zx.io.api.ApiUtils.createServerApi(zx.server.work.pools.IWorkerPoolApi, this);
    zx.io.api.server.ConnectionManager.getInstance().registerApi(this.__serverApi, this.__apiPath);
  },

  properties: {
    /**
     * Config options for the internal {@link zx.utils.Pool}
     * @type {object} config - configuration options for the pool. These can be changed at any time with the corresponding property
     * @prop {number} [config.minSize] - the minimum number of resources to keep alive in the pool (impacts idle overhead)
     * @prop {number} [config.maxSize] - the maximum number of resources to create in the pool (impacts maximum load)
     * @prop {number} [config.timeout] - the number of milliseconds to wait for a resource to become available before failing
     * @prop {number} [config.pollInterval] - the number of milliseconds between checks for available resources
     */
    poolConfig: {
      init: null,
      nullable: true,
      check: "Object",
      event: "changePoolConfig",
      apply: "_applyPoolConfig"
    },

    /** Where to persist the WorkResult and other files */
    workDir: {
      check: "String",
      apply: "_applyWorkDir"
    },

    /** Scheduler to poll from */
    schedulerApi: {
      check: "zx.server.work.scheduler.ISchedulerApi"
    },

    /** Frequency, in milliseconds, to poll the scheduler when there are spare Workers in the pool */
    pollInterval: {
      check: "Integer",
      init: 5_000,
      event: "changePollInterval"
    },

    /** Frequency, in milliseconds, to try to push completed work back to the scheduler when the scheduler is offline */
    pushInterval: {
      check: "Integer",
      init: 10_000,
      event: "changePushInterval"
    },

    /**
     * Whether to copy the console output of the WorkerPool and WorkerTracker
     */
    copyConsoleTo: {
      init: null,
      nullable: true,
      check: ["info", "warn", "debug"]
    },

    /** Whether to enable Chromium for the Workers */
    enableChromium: {
      init: true,
      check: "Boolean"
    },

    /** Docker image name to use for containers */
    dockerImage: {
      init: "zenesisuk/zx-puppeteer-server:latest",
      check: "String"
    },

    /** @type {String[]?} array of mounts, in the form "aliasName:hostPath" */
    dataMounts: {
      init: null,
      nullable: true,
      check: "Array"
    },

    /** @type {String[]?} array of mounts, in the form "sourcePath:containerPath", all paths must be absolute */
    dockerMounts: {
      init: null,
      nullable: true,
      check: "Array"
    },

    dockerExtraHosts: {
      init: null,
      nullable: true,
      check: "Array"
    },

    /** Command to run in docker */
    dockerCommand: {
      init: "/home/pptruser/bin/start.sh",
      nullable: true,
      check: "String"
    },

    /** Label used to identify old containers, so that they can be cleaned up */
    dockerServicesTypeLabel: {
      init: "zx-worker",
      check: "String"
    },

    /** Whether to make the child node process debuggable */
    nodeInspect: {
      init: "none",
      check: ["none", "inspect", "inspect-brk"]
    },

    /** How long to wait for the node process to shutdown gracefully */
    shutdownTimeout: {
      init: 10000,
      check: "Integer"
    }
  },

  objects: {
    pool() {
      let pool = new zx.utils.Pool();
      pool.setFactory(this);
      pool.addListener("becomeAvailable", () => {
        this.debug("pool sent becomeAvailable");
        this.__pollTimer.startTimer();
      });
      pool.addListener("becomeUnavailable", () => {
        this.debug("pool sent becomeUnavailable");
        if (this.__pollTimer) {
          this.__pollTimer.killTimer();
        }
      });
      pool.addListener("createResource", this.__onPoolCreateResource, this);
      pool.addListener("destroyResource", this.__onPoolDestroyResource, this);
      return pool;
    }
  },

  members: {
    /**
     * API path where this worker pool can be accessed
     */
    __apiPath: "",

    /** @type {zx.server.work.WorkResult[]} queue of WorkResults to send back to the scheduler */
    __workResultQueue: null,

    /** @type {Object<String,zx.server.work.WorkTracker>} WorkTrackers that are currently running Work, indexed by work UUID */
    __runningWorkTrackers: null,

    /** @type {Promise} mutex for `__pushQueuedResultsToScheduler` */
    __pushQueuedResultsToSchedulerPromise: null,

    __pollTimer: null,
    __pushTimer: null,

    /**
     * @type {zx.server.work.pools.IWorkerPoolApi}
     */
    __serverApi: null,

    /**
     * @returns {zx.server.work.pools.IWorkerPoolApi}
     */
    getServerApi() {
      return this.__serverApi;
    },

    /**
     * @returns {string}
     */
    getApiPath() {
      return this.__apiPath;
    },

    /**
     * Instruct the pool to start creating workers and polling for work
     */
    async startup() {
      let workDir = path.join(this.getWorkDir(), "work");
      await fs.promises.mkdir(workDir, { recursive: true });
      let files = await fs.promises.readdir(workDir);
      for (let file of files) {
        let fullPath = path.join(workDir, file);
        let stat = await fs.promises.stat(fullPath);
        if (stat.isDirectory()) {
          let workResult = await zx.server.work.WorkResult.loadFromDir(fullPath);
          if (workResult) {
            this.__workResultQueue.push(workResult);
          }
        }
      }
      await this.getQxObject("pool").startup();
      this.__pollTimer = new zx.utils.Timeout(null, this.__pollForNewWork, this).set({
        recurring: false,
        duration: this.getPollInterval()
      });

      this.__pushTimer = new zx.utils.Timeout(null, this.__pushQueuedResultsToScheduler, this).set({
        recurring: false,
        duration: this.getPushInterval()
      });
      this.__pushTimer.startTimer();
      this.__pollTimer.startTimer();
    },

    /**
     * Shut down the pool and all pooled workers
     *
     * Shutdown will wait for all pending messages to send before shutting down, unless a destructiveMs is provided
     * @param {number} [forceAfterMs] - the number of milliseconds to wait before forcibly shutting down. Use any negative value to wait indefinitely. Defaults to -1.
     */
    async shutdown(forceAfterMs = -1) {
      if (!this.__pollTimer) {
        throw new Error("WorkerPool is not running and cannot be shutdown");
      }
      await this.getQxObject("pool").shutdown();
      this.__pollTimer.killTimer();
      this.__pollTimer.dispose();
      this.__pollTimer = null;
      this.__pushTimer.killTimer();
      this.__pushTimer.dispose();
      this.__pushTimer = null;
      await this.__pushQueuedResultsToScheduler();
    },

    /**
     * Cleans up any old containers that may have been left behind; the containers are identified by the
     * label `dockerServicesTypeLabel`
     */
    async cleanupOldContainers() {
      const Docker = require("dockerode");
      let docker = new Docker();
      let containers = await docker.listContainers({
        all: true
      });

      for (let containerInfo of containers) {
        if (containerInfo.Labels && containerInfo.Labels["zx.services.type"] == this.getDockerServicesTypeLabel()) {
          let container = docker.getContainer(containerInfo.Id);
          if (containerInfo.State == "running") {
            try {
              await container.kill();
            } catch (ex) {
              // Nothing
            }
          }
          try {
            await container.remove();
          } catch (ex) {
            // Nothing
          }
        }
      }
    },

    /**
     * Apply for `poolConfig` property
     */
    _applyPoolConfig(value, oldValue) {
      if (!value) return;
      let pool = this.getQxObject("pool");
      ["minSize", "maxSize", "timeout", "pollInterval"].forEach(prop => {
        let upname = qx.lang.String.firstUp(prop);
        if (value[prop] !== undefined) {
          pool["set" + upname](value[prop]);
        } else {
          pool["reset" + upname](value[prop]);
        }
      });
    },

    /**
     * Apply for `workDir` property
     */
    _applyWorkDir(value, oldValue) {
      let pool = this.getQxObject("pool");
      if (pool.getSize() > 0) {
        throw new Error("Cannot change workDir while pool is running");
      }
    },

    /**
     * Event handler for when the pool creates a new resource (a WorkTracker)
     */
    __onPoolCreateResource(evt) {
      let workerTracker = evt.getData();
      workerTracker.addListener("changeStatus", this.__onWorkTrackerStatusChange, this);
    },

    /**
     * Event handler for when the pool permanently destroys a resource (a WorkTracker)
     */
    __onPoolDestroyResource(evt) {
      let workerTracker = evt.getData();
      let workResult = workerTracker.takeWorkResult();
      if (workResult) {
        this.__workResultQueue.push(workResult);
        delete this.__runningWorkTrackers[workResult.getJsonWork().uuid];
      }
      workerTracker.removeListener("changeStatus", this.__onWorkTrackerStatusChange, this);
    },

    /**
     * Events handler for changes to a WorkTracker's status
     */
    __onWorkTrackerStatusChange(evt) {
      let status = evt.getData();
      if (status !== "dead" && status !== "stopped") {
        return;
      }
      let pool = this.getQxObject("pool");
      let workerTracker = evt.getTarget();
      let workResult = workerTracker.takeWorkResult();
      if (workResult) {
        delete this.__runningWorkTrackers[workResult.getJsonWork().uuid];
      }
      if (status === "dead") {
        pool.destroyResource(workerTracker);
      } else if (status === "stopped") {
        queueMicrotask(() => workerTracker.reuse());
        pool.release(workerTracker);
      }
      if (workResult) {
        this.__workResultQueue.push(workResult);
        this.__pushTimer.startTimer();
      }
    },

    /**
     * Event handler for when we need to poll for new work
     */
    async __pollForNewWork() {
      if (this.getQxObject("pool").available()) {
        let jsonWork = null;
        try {
          jsonWork = await this.getSchedulerApi().pollForWork({ id: this.classname, uuid: this.toUuid() });
        } catch (e) {
          this.debug(`failed to poll for work: ${e}`);
        }
        if (jsonWork) {
          this.debug(`received work!`);

          let workerTracker = await this.getQxObject("pool").acquire();
          this.__runningWorkTrackers[jsonWork.uuid] = workerTracker;
          workerTracker.runWork(jsonWork);
        }
      }
      this.__pollTimer.startTimer();
    },

    /**
     * Called on a timer to send results back to the scheduler
     */
    async __pushQueuedResultsToScheduler() {
      if (this.__pushQueuedResultsToSchedulerPromise) {
        return await this.__pushQueuedResultsToSchedulerPromise;
      }
      const doPushQueuedResultsToScheduler = async () => {
        while (this.__workResultQueue.length) {
          let workResult = this.__workResultQueue[0];
          let jsonResult = await workResult.serializeForScheduler();
          try {
            await this.getSchedulerApi().onWorkCompleted(jsonResult);
          } catch (ex) {
            this.error(`Failed to push work result to scheduler: ${ex}`);
            break;
          }
          this.__workResultQueue.shift();
          workResult.deleteWorkDir();
        }
        if (this.__workResultQueue.length) {
          this.__pushTimer.startTimer();
        }
      };
      this.__pushQueuedResultsToSchedulerPromise = doPushQueuedResultsToScheduler();
      await this.__pushQueuedResultsToSchedulerPromise;
      this.__pushQueuedResultsToSchedulerPromise = null;
    },

    /**
     * @Override
     */
    createPoolableEntity() {
      throw new Error(`Abstract method ${this.classname}.createPoolableEntity from IPoolFactory not implemented`);
    },

    /**
     * @override
     */
    async destroyPoolableEntity(entity) {
      await entity.close();
    },

    /**
     * @override
     */
    async killWork(uuid) {
      if (!this.__runningWorkTrackers[uuid]) {
        throw new Error("No work with that UUID");
      }
      await this.__runningWorkTrackers[uuid].killWork();
      delete this.__runningWorkTrackers[uuid];
    },

    /**@override */
    getDescriptionJson() {
      return {
        uuid: this.toUuid(),
        classname: this.classname,
        apiPath: this.getApiPath(),
        runningWorkerTrackers: Object.values(this.__runningWorkTrackers).map(workerTracker => workerTracker.getDescriptionJson())
      };
    },

    /**
     * Get information about a current work that is running
     *
     * @param {string} uuid
     * @returns {Object}
     */
    getWorkerStatusJson(uuid) {
      let workerTracker = this.__runningWorkTrackers[uuid];
      if (!workerTracker) {
        throw new Error("No work with that UUID");
      }

      return workerTracker.getWorkResult().serializeForScheduler();
    }
  }
});
