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
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************ */

const Docker = require("dockerode");
const fs = require("fs");
const path = require("path");

/**
 * Tracks a worker; the worker is often in a remote process, and will feed back logs and status
 * via the WorkerClientApi.  Instances of this class are used to track everything about that
 * Worker, including storing the logs and status ready to be passed back to the Scheduler
 * when the Worker is complete.
 *
 * @typedef DescriptionJson
 * @property {string} uuid
 * @property {string} status
 * @property {zx.server.work.WorkResult.Description?} workResult
 * @property {Date?} lastActivity
 */
qx.Class.define("zx.server.work.WorkerTracker", {
  extend: qx.core.Object,

  /**
   *
   * @param {zx.server.work.pools.WorkerPool} workerPool
   * @param {zx.server.work.IWorkerApi?} workerClientApi
   */
  construct(workerPool, workerClientApi) {
    super();
    this.__workerPool = workerPool;
    this.__workerClientApi = workerClientApi;
  },

  destruct() {
    this.__workerClientApi.terminate();
    this.__workerClientApi.dispose();
    this.__workerClientApi = null;
    if (this._containerConsoleLog) {
      this._containerConsoleLog.dispose();
      this._containerConsoleLog = null;
    }
  },

  properties: {
    status: {
      init: "waiting",
      check: ["waiting", "running", "stopped", "killing", "dead"],
      event: "changeStatus"
    }
  },

  members: {
    /**
     * @type {qx.util.Debounce} A watchdog which terminates the running work if its has
     * not shown activity for a certain time
     */
    __watchDog: null,

    /**
     * @type {Date?} the last time that the worker showed activity
     */
    __lastActivity: null,

    /** @type {zx.server.work.pools.WorkerPool} the pool this belong to */
    __workerPool: null,

    /** @type {zx.server.work.IWorkerApi} connection to the actual worker */
    __workerClientApi: null,

    /** @type {*?} the currently running work */
    __jsonWork: null,

    /** @type {zx.server.work.WorkResult} the output of the currently running (or just stopped) work */
    __workResult: null,

    /** @type {zx.utils.IncrementalLogWriter} where to log the container console output */
    _containerConsoleLog: null,

    /** @type {zx.utils.Timeout} timer used to watch the container to see if it disappears */
    _containerWatcher: null,

    /** @type {Integer} the port that the node process will be listening to; this can be for API calls or it's the puppeteer server in docker */
    _nodeHttpPort: null,

    /** @type {Promise} promise that resolves when the currently queued getDockerContainer method completes (ie a mutex) */
    __createDockerContainerPromise: null,

    /**
     * Called when starting the WorkTracker
     */
    async initialize() {
      await this.__workerClientApi.subscribe("log", data => {
        if (this.getStatus() !== "running") {
          return;
        }

        if (this.__jsonWork?.uuid === data.caller) {
          this.appendWorkLog(data.message);
        } else {
          this.error(data.message);
        }
        this.__watchDog.trigger();
        this.__lastActivity = new Date();
      });
      await this.__workerClientApi.subscribe("ping", () => {
        if (this.getStatus() !== "running") {
          return;
        }
        this.__watchDog.trigger();
        this.__lastActivity = new Date();
      });
    },

    /**
     * Closes the WorkerTracker and frees resources
     */
    async close() {
      this.debug(`Closing worker`);
      let clientApi = this.getWorkerClientApi();
      try {
        await clientApi.shutdown();
      } catch (ex) {
        // Shutdown will reject the method call, so this is actually expected
        this.trace(`Expected exception while shutting down worker: ${ex}`);
      }
      await this._closeContainer();
      clientApi.terminate();
    },

    /**
     * Sets the WorkerClientApi for this WorkerTracker; this is only used if it could not be set in the constructor
     */
    _setWorkerClientApi(workerClientApi) {
      if (this.__workerClientApi) {
        throw new Error("Cannot set workerClientApi more than once");
      }
      this.__workerClientApi = workerClientApi;
    },

    /**
     * Returns the WorkerClientApi for this WorkerTracker
     *
     * @returns {zx.server.work.IWorkerApi}
     */
    getWorkerClientApi() {
      return this.__workerClientApi;
    },

    /**
     * Returns the WorkerPool for this WorkerTracker
     *
     * @returns {zx.server.work.pools.WorkerPool}
     */
    getWorkerPool() {
      return this.__workerPool;
    },

    /**
     * Called to start a new piece of work on the worker
     *
     * @param {*} jsonWork
     */
    async runWork(jsonWork) {
      this.setStatus("running");

      //Initialize work result
      if (this.__workResult) {
        throw new Error("WorkerTracker already has work");
      }
      this.__jsonWork = jsonWork;
      let workdir = path.join(this.__workerPool.getWorkDir(), "work", zx.server.Standalone.getUuidAsPath(jsonWork.uuid));
      this.__workResult = new zx.server.work.WorkResult();
      await this.__workResult.initialize(workdir, jsonWork);

      this.__workResult.writeStatus();

      //Set up watchdog
      const WATCHDOG_TIMEOUT = 5 * 60 * 1000;
      this.__watchDog = new qx.util.Debounce(() => {
        this.appendWorkLog("Task aborted due to inactivity timeout.");
        this.killWork();
      }, WATCHDOG_TIMEOUT);

      //Run the work!
      let promise = this.__workerClientApi.run(jsonWork);
      promise.then(async response => await this._onWorkComplete(response));
    },

    /**
     * Appends a message to the log for the Work
     *
     * @param {String} message
     */
    appendWorkLog(message) {
      if (this.__workResult) {
        this.__workResult.appendWorkLog(message);
      }
    },

    /**
     * Called when the work is complete
     * @param {zx.server.work.IWorkerApi.WorkResponse} response
     */
    async _onWorkComplete(response) {
      if (this.getStatus() != "running") {
        this.debug(`Ignoring work complete as status is ${this.getStatus()}`);
        return;
      }

      this.appendWorkLog("Work complete for " + this.__jsonWork.uuid + ", response = " + JSON.stringify(response));
      await this.__closeWorkResult(response);

      if (response.exception) {
        this.setStatus("dead");
      } else {
        this.setStatus("stopped");
      }

      await this.__cleanupAfterWork();
    },

    /**
     * Kills the work and the worker
     */
    async killWork() {
      if (this.getStatus() != "running") {
        this.debug("Ignoring killWork as status is " + this.getStatus());
        return;
      }

      this.setStatus("killing");

      await this.__closeWorkResult({ exception: "Task aborted." });
      this.setStatus("dead");
      this.__cleanupAfterWork();
    },

    async __closeWorkResult(response) {
      let workResult = this.__workResult;
      workResult.setResponse(response);
      await workResult.close();
    },

    async __cleanupAfterWork() {
      this.__jsonWork = null;
      this.__watchDog.dispose();
      this.__watchDog = null;
      this.__lastActivity = null;
    },

    getWorkResult() {
      return this.__workResult;
    },

    /**
     * Called by the WorkerPool when a Work is finished, so that the results can be shipped back to the Scheduler
     */
    takeWorkResult() {
      let workResult = this.__workResult;
      this.__workResult = null;
      return workResult;
    },

    /**
     * Called to reuse the worker, before it goes back into the pool
     */
    async reuse() {
      if (this.getStatus() == "killing" || this.getStatus() == "dead") {
        throw new Error("Cannot reuse a WorkerTracker that is killing or dead");
      }
      if (this.getStatus() != "stopped") {
        throw new Error("Cannot reuse a WorkerTracker that is not stopped");
      }
      if (this.__workResult) {
        this.error(`Reusing a WorkerTracker that still has a workResult - ${this.__workResult}`);
        this.__workResult = null;
      }
      this.setStatus("waiting");
    },

    /**
     * Gets, allocating if necessary, the port for the chromium server
     *
     * @returns {Integer} the port for the chromium server (exposed by the docker container)
     */
    _getChromiumPort() {
      if (!this.__chromiumPort) {
        this.__chromiumPort = zx.server.PortRanges.CHROMIUM_PORT_RANGE.acquire();
      }
      return this.__chromiumPort;
    },

    /**
     * Gets, allocating if necessary, the port for the node http server
     *
     * @returns {Integer} the port for the node http server
     */
    _getNodeHttpPort() {
      if (!this._nodeHttpPort) {
        this._nodeHttpPort = zx.server.PortRanges.NODE_HTTP_SERVER_API_PORT_RANGE.acquire();
      }
      return this._nodeHttpPort;
    },

    /**
     * Gets a Docker Container for this Work, creating the container if necessary
     *
     * @returns {Docker.Container}
     */
    async getDockerContainer() {
      if (!this.getWorkerPool().isEnableChromium()) {
        this.error(`Chromium is not enabled for ${this.classname}`);
      }

      if (this._container) {
        return this._container;
      }

      const createContainer = async (configCb, readySignal) => {
        this._container = await this._createDockerContainer();
        let chromiumUrl = `http://localhost:${this._getChromiumPort()}`;
        await this.getWorkerClientApi().setChromiumUrl(chromiumUrl);
        await this.getWorkerClientApi().setDataMounts(this.getWorkerPool().getDataMounts());
      };
      if (!this.__createDockerContainerPromise) {
        this.__createDockerContainerPromise = createContainer();
      }
      await this.__createDockerContainerPromise;
      return this._container;
    },

    /**
     * Creates a Docker configuration for the worker; if configCb is provided, it will be called with
     * the Docker config so that it can be adjusted to suit.  This allows the implementation of the
     * tracker to adjust the Docker configuration as necessary, but leaves the actual creation of the
     * container to the _createDockerContainer method which is called as needed by the Work
     *
     * @param {String} workerLocation one of: "this-process" or "host" or "container"
     * @param {String} inspect one of "inspect", "inspect-brk", "none"
     * @param {Function?} configCb
     * @param {String?} readySignal
     */
    async _createDockerConfiguration(workerLocation, inspect, configCb, readySignal) {
      if (!readySignal) {
        readySignal = "Webserver started on http";
      }
      let workerPool = this.getWorkerPool();

      /*
       * If the Worker is in this process then:
       *    Worker HTTP (for API):              N/A    [nodeHttpPort]
       *    Worker Node Debug:                  N/A    [nodeDebugPort]
       *    Puppeteer Server (from Container):  11000  [chromiumPort]
       *    Chromium (from Container):          11000 (proxied by Puppeteer Server)
       *    Puppeteer Server Node Debug:        9230   [chromiumDebugPort]
       *
       * If the Worker in on the host, then:
       *    Worker HTTP (for API):              10000  [nodeHttpPort]
       *    Worker Node Debug:                  9229   [nodeDebugPort]
       *    Puppeteer Server (from Container):  11000  [chromiumPort]
       *    Chromium (from Container):          11000 (proxied by Puppeteer Server)
       *    Puppeteer Server Node Debug:        9230   [chromiumDebugPort]
       *
       * If the Worker is in a Container, then:
       *    Worker HTTP (for API) (from Container):  10000  [nodeHttpPort]
       *    Worker Node Debug (from Container):      9229   [nodeDebugPort]
       *    Chromium (from Container):               11000  [chromiumPort]
       */

      let ExposedPorts = {};
      let PortBindings = {};
      let Env = {};

      if (workerLocation == "this-process") {
        ExposedPorts[`11000/tcp`] = {};
        PortBindings[`11000/tcp`] = [{ HostPort: String(this._getChromiumPort()) }];

        if (inspect != "none") {
          this.__chromiumDebugPort = zx.server.PortRanges.NODE_DEBUG_PORT_RANGE.acquire();
          ExposedPorts[`9230/tcp`] = {};
          PortBindings[`9230/tcp`] = [{ HostPort: String(this.__chromiumDebugPort) }];
          Env.ZX_NODE_INSPECT = `--${inspect}=0.0.0.0:9230`;
        }
      } else if (workerLocation == "host") {
        ExposedPorts[`11000/tcp`] = {};
        PortBindings[`11000/tcp`] = [{ HostPort: String(this._getChromiumPort()) }];

        if (inspect != "none") {
          this.__chromiumDebugPort = zx.server.PortRanges.NODE_DEBUG_PORT_RANGE.acquire();
          ExposedPorts[`9230/tcp`] = {};
          PortBindings[`9230/tcp`] = [{ HostPort: String(this.__chromiumDebugPort) }];
          Env.ZX_NODE_INSPECT = `--${inspect}=0.0.0.0:9230`;
        }
      } else {
        ExposedPorts[`10000/tcp`] = {};
        PortBindings[`10000/tcp`] = [{ HostPort: String(this._getNodeHttpPort()) }];

        if (inspect != "none") {
          ExposedPorts[`9229/tcp`] = {};
          PortBindings[`9229/tcp`] = [{ HostPort: String(this._getNodeDebugPort()) }];
          Env.ZX_NODE_INSPECT = `--${inspect}=0.0.0.0:9229`;
        }

        ExposedPorts[`11000/tcp`] = {};
        PortBindings[`11000/tcp`] = [{ HostPort: String(this._getChromiumPort()) }];
      }

      // prettier-ignore
      let config = zx.server.Config.getInstance().getConfigData();
      if (config.work.multihomed) {
        Env.ZX_NODE_ARGS = `./runtime/${config.websiteName}/puppeteer-server/index.js launch --port=11000`;
      } else {
        Env.ZX_NODE_ARGS = `./runtime/puppeteer-server/index.js launch --port=11000`;
      }
      Env.ZX_MODE = `worker`;

      /** @type {import('dockerode').ContainerCreateOptions} */
      let dockerConfig = {
        Image: workerPool.getDockerImage(),
        name: `zx-worker-${this._getNodeHttpPort()}`,
        AttachStderr: true,
        AttachStdout: true,
        Env,
        Labels: {
          "zx.services.type": workerPool.getDockerServicesTypeLabel()
        },
        ExposedPorts,
        Tty: true,
        HostConfig: {
          AutoRemove: true,
          Binds: [],
          PortBindings
        }
      };
      if (workerPool.getDockerCommand()) {
        dockerConfig.Cmd = workerPool.getDockerCommand().split(" ");
      }

      if (workerPool.getDockerExtraHosts()) {
        dockerConfig.HostConfig.ExtraHosts = workerPool.getDockerExtraHosts();
      }

      if (workerPool.getDockerMounts()) {
        for (let mount of workerPool.getDockerMounts()) {
          let segs = mount.split(":");
          if (segs.length != 2 || !path.isAbsolute(segs[1])) {
            throw new Error(`Invalid docker mount: ${mount}`);
          }
          segs[0] = path.resolve(process.cwd(), segs[0]);
          mount = segs.join(":");
          dockerConfig.HostConfig.Binds.push(mount);
        }
      }

      if (configCb) {
        configCb(dockerConfig);
      }

      dockerConfig.Env = Object.keys(dockerConfig.Env).map(key => `${key}=${dockerConfig.Env[key]}`);

      this.__dockerConfiguration = dockerConfig;
      this.__dockerReadySignal = readySignal || "Webserver started on http";
    },

    /**
     * Creates a Docker container for the worker, using the configuration created by _createDockerConfiguration
     *
     * @returns {import('dockerode').Container}
     */
    async _createDockerContainer() {
      let dockerConfig = this.__dockerConfiguration;
      let containerDir = path.join(this.getWorkerPool().getWorkDir(), "container", "" + this._getNodeHttpPort());
      await fs.promises.mkdir(containerDir, { recursive: true });
      this._containerConsoleLog = new zx.utils.IncrementalLogWriter(path.join(containerDir, "console.log"));

      const onContainerMessage = message => {
        if (this._containerConsoleLog) {
          this._containerConsoleLog.write(message + "\n");
        }
        this.appendWorkLog(message);
      };

      // prettier-ignore
      onContainerMessage("Starting container\n" +
          "  pwd: " + process.cwd() + "\n" +
          "  image: " + dockerConfig.Image + "\n" +
          "  chromiumPort: " + this.__chromiumPort + "\n" +
          "  nodeHttpPort: " + this._getNodeHttpPort() + "\n" +
          "  nodeDebugPort: " + this.__nodeDebugPort + "\n" +
          "  Docker Container Config: " + JSON.stringify(dockerConfig, null, 2));

      let docker = new Docker();
      let container = await docker.createContainer(dockerConfig);
      this._container = container;

      let promise = new qx.Promise();
      let streams = new zx.utils.BufferedIoStreams(line => {
        if (line.toString().indexOf(this.__dockerReadySignal) > -1) {
          promise.resolve();
        } else {
          onContainerMessage(line);
        }
      });
      this._container.attach({ stream: true, stdout: true, stderr: false }, (err, stream) => {
        if (err) {
          this.error("Error attached to stdout stream from Docker: " + err);
        } else {
          streams.add(stream);
        }
      });
      this._container.attach({ stream: true, stdout: false, stderr: true }, (err, stream) => {
        if (err) {
          this.error("Error attached to stderr stream from Docker: " + err);
        } else {
          streams.add(stream);
        }
      });
      await container.start();
      let shutdownDetected = false;
      this._containerWatcher = new zx.utils.Timeout(2000, async () => {
        let state;
        try {
          state = await container.inspect();
        } catch (ex) {
          this.error("Error inspecting container: " + ex);
        }
        if (!state?.State?.Running && !shutdownDetected) {
          shutdownDetected = false;
          this._containerWatcher.setEnabled(false);
          this.fireEvent("containerShutdown");
          if (promise != null) {
            let log = await this._containerConsoleLog.read();
            this.debug("Container did not start: \n" + log);
            promise.reject(new Error("Container did not start"));
            promise = null;
          }
        }
      }).set({
        recurring: true
      });
      this._containerWatcher.startTimer();
      this.debug(`started container, waiting for ready signal...`);
      await promise;
      promise = null;
      this.debug("container ready");
      return container;
    },

    /**
     * Closes the Docker container and releases the chromium port
     */
    async _closeContainer() {
      if (this._container) {
        this._containerWatcher.dispose();
        let timeout = this.getWorkerPool().getShutdownTimeout();
        let timedWaitFor = new zx.utils.TimedWaitFor(timeout);
        this._container.stop(() => {
          this.debug(`Container stopped`);
          timedWaitFor.fire();
        });
        await timedWaitFor.wait();
        this._container = null;
      }
      if (this.__chromiumPort) {
        zx.server.PortRanges.CHROMIUM_PORT_RANGE.release(this.__chromiumPort);
        this.__chromiumPort = null;
      }
    },

    /**
     * @Override
     */
    toString() {
      return `NodeProcessWorkerTracker:${this._nodeHttpPort}[this.toHashCode()]`;
    },

    /**
     *
     * @returns {DescriptionJson}
     */
    getDescriptionJson() {
      let workResult = this.__workResult?.serializeForScheduler();
      if (workResult && !workResult.workStatus) {
        //we don't care about it if it has no work status, because we only care about work results that have started.
        workResult = null;
      }

      return {
        uuid: this.toUuid(),
        status: this.getStatus(),
        workResult,
        lastActivity: this.__lastActivity
      };
    }
  }
});
