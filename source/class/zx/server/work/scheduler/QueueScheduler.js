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

const fs = require("fs");
const path = require("path");

/**
 * A simple queue based scheduler
 *
 * @typedef WorkQueueEntry
 * @property {zx.server.work.IWork.WorkJson} workJson the work to do
 * @property {{id: string, uuid: string}} pool
 * @property {Promise} promise the promise which resolves when the work is done
 *
 * @use(zx.io.api.client.AbstractClientApi)
 */
qx.Class.define("zx.server.work.scheduler.QueueScheduler", {
  extend: qx.core.Object,
  implement: [zx.server.work.scheduler.ISchedulerApi],

  construct(workDir) {
    super();
    this.__queue = [];
    this.__running = {};
    this.__workDir = workDir;

    this.__poolsByUuid = {};
    this.__serverApi = zx.io.api.ApiUtils.createServerApi(zx.server.work.scheduler.ISchedulerApi, this);
  },

  properties: {
    /** Whether to rotate working directories so that there is a seperate dir per day and startup, inside the `workDir` given to the constructor */
    rotateWorkDir: {
      check: "Boolean",
      init: false
    }
  },

  events: {
    /** Fired when a work item is started, the data is the serialized JSON from `WorkResult.serializeForScheduler` */
    workStarted: "qx.event.type.Data",

    /** Fired when a work item is completed, the data is the serialized JSON from `WorkResult.serializeForScheduler` */
    workCompleted: "qx.event.type.Data",

    /** Fired when there is no work to do */
    noWork: "qx.event.type.Event"
  },

  members: {
    /**
     * @type {Object<String, zx.server.work.pools.IWorkerPoolApi.PoolInfo>}
     * A map of pools that this scheduler is aware of, indexed by pool UUID
     */
    __poolsByUuid: null,

    /** @type {String?} the directory to store work results */
    __workDir: null,

    /** @type {String} the directory to store work results, after rotation */
    __rotatedWorkDir: null,

    /** @type {Date} the last day that we tried to rotate - we only check once per day */
    __lastRotation: null,

    /** @type {WorkQueueEntry[]} the queue */
    __queue: null,

    /** @type {Object<String, WorkQueueEntry>} the running work, indexed by work UUID */
    __running: null,

    /** @type {zx.server.work.scheduler.ISchedulerApi} a server API that can be used to call this scheduler */
    __serverApi: null,

    /**
     * Registers a pool with this scheduler.
     * @param {zx.server.work.pools.IWorkerPoolApi.PoolInfo} pool
     */
    addPool(pool) {
      this.__poolsByUuid[pool.uuid] = pool;
    },

    /**
     * Starts the scheduler
     */
    async startup() {
      if (this.__workDir) {
        await fs.promises.mkdir(this.__workDir, { recursive: true });
      }
    },

    /**
     * Returns the working directory, used for logs etc
     *
     * @returns {String?} the directory to store work results
     */
    getWorkDir() {
      if (!this.__workDir) {
        return null;
      }
      if (this.getRotateWorkDir()) {
        if (!zx.utils.Dates.sameDay(this.__lastRotation, new Date())) {
          const DF = new qx.util.format.DateFormat("yyyy-MM-dd");
          let dir = path.join(this.__workDir, DF.format(new Date()));
          let testForDir = dir;
          let pass = 0;
          while (true) {
            let stat = null;
            try {
              stat = fs.statSync(this.__workDir);
            } catch (ex) {
              // Nothing - does not exist
            }
            if (stat) {
              pass++;
              testForDir = `${dir}-${pass}`;
            } else {
              break;
            }
          }
          this.__rotatedWorkDir = testForDir;
          this.__lastRotation = new Date();
        }
        return this.__rotatedWorkDir;
      }
      return this.__workDir;
    },

    /**
     * Adds a work item to the queue
     *
     * @param {zx.server.work.IWork.WorkJson} workJson
     * @return {Promise} resolves when the work is completed
     */
    async pushWork(workJson) {
      if (!workJson.workClassname) {
        throw new Error("workJson must have a workClassname");
      }
      if (!workJson.uuid) {
        workJson.uuid = qx.util.Uuid.createUuidV4();
      }
      if (this.__running[workJson.uuid]) {
        this.error(`Work ${workJson.uuid} is already running`);
        return;
      }
      if (this.__queue.find(entry => entry.workJson.uuid === workJson.uuid)) {
        this.error(`Work ${workJson.uuid} is already queued`);
        return;
      }
      this.debug(`Queuing job ${workJson.uuid} of type ${workJson.workClassname}`);
      let promise = new qx.Promise();
      this.__queue.push({
        workJson,
        promise
      });
      await promise;
    },

    /**
     * @Override
     */
    async pollForWork(poolInfo) {
      if (this.__queue.length === 0) {
        this.fireEvent("noWork");
        return null;
      }
      let info = this.__queue.shift();
      info.pool = poolInfo;
      this.__running[info.workJson.uuid] = info;
      await this.fireDataEventAsync("workStarted", info.workJson);
      return info.workJson;
    },

    /**
     * @Override
     * @param {zx.server.work.WorkResult.WorkResultJson} workResultData
     */
    async onWorkCompleted(workResultData) {
      this.debug(`Work completed for job ${workResultData.workJson.uuid}`);
      let info = this.__running[workResultData.workJson.uuid];
      if (info) {
        delete this.__running[workResultData.workJson.uuid];
        info.promise.resolve(workResultData);
      } else {
        this.debug(`Work completed for job ${workResultData.workJson.uuid} but not found in running list (Worker Pool has queued this work)`);
      }
      if (this.__workDir) {
        let workDir = path.join(this.getWorkDir(), zx.server.Standalone.getUuidAsPath(workResultData.workJson.uuid));
        await fs.promises.mkdir(workDir, { recursive: true });
        await zx.server.work.WorkResult.deserializeFromScheduler(workDir, workResultData);
      }
      if (info) {
        //Store result in the database
        let colResults = zx.server.Standalone.getInstance().getDb().getCollection("zx.server.work.scheduler.QueueScheduler.WorkResult");
        workResultData.pool = info.pool;
        colResults.insertOne(workResultData);

        await this.__cleanOldWorkResults();
        await this.fireDataEventAsync("workCompleted", workResultData);
      }
    },

    /**
     * Returns the server API for this scheduler
     *
     * @return {zx.server.work.scheduler.ISchedulerApi}
     */
    getServerApi() {
      return this.__serverApi;
    },

    /**
     * Returns the queue size
     *
     * @returns {Number} the number of items in the queue
     */
    getQueueSize() {
      return this.__queue.length;
    },

    /**
     * Returns the number of tasks currently running
     *
     * @returns {Number} the number of items running
     */
    getRunningSize() {
      return Object.keys(this.__running).length;
    },

    /**@override @interface zx.server.work.scheduler.ISchedulerApi */
    getPools() {
      return Object.values(this.__poolsByUuid);
    },

    /**
     * @override interface zx.server.work.scheduler.ISchedulerApi
     *
     * @param {SearchData} search
     *
     * @typedef SearchData
     * @property {string?} text - the search string to filter tasks by
     * @property {{id: string?, uuid: string?}?} pool - the ID of the pool to filter tasks by, or `null` for all pools
     * @property {string?} workUuid UUID of the work in the work JSON
     * @returns {Promise<zx.server.work.WorkResult.WorkResultJsonMin[]>} A promise that resolves with an array of work results matching the search criteria
     */
    async getPastWorkResults(search) {
      let match = {};

      if (search.text) {
        match["$or"] = [
          { "workJson.uuid": { $regex: search.text, $options: "i" } },
          { "workJson.title": { $regex: search.text, $options: "i" } },
          { "workJson.description": { $regex: search.text, $options: "i" } },
          { "workJson.workClassname": { $regex: search.text, $options: "i" } }
        ];
      }

      if (search.workUuid) {
        match["workJson.uuid"] = search.workUuid;
      }

      if (search.pool) {
        if (search.pool.id) {
          match["pool.id"] = search.pool.id;
        }
        if (search.pool.uuid) {
          match["pool.uuid"] = search.pool.uuid;
        }
      }

      let out = await zx.server.Standalone.getInstance()
        .getDb()
        .getCollection("zx.server.work.scheduler.QueueScheduler.WorkResult")
        .aggregate([
          {
            $match: match
          },
          {
            $sort: {
              "workStatus.started": -1
            }
          },
          {
            $limit: 100
          },
          {
            $addFields: {
              log: -1,
              logLength: { $strLenCP: "$log" }
            }
          }
        ])
        .toArray();

      return out;
    },

    async __cleanOldWorkResults() {
      let colResults = zx.server.Standalone.getInstance().getDb().getCollection("zx.server.work.scheduler.QueueScheduler.WorkResult");

      const MAX_RESULTS_PER_WORK = 10;

      //Ensure there are no more than `MAX_RESULTS_PER_WORK` results per work JSON UUID
      let resultsByWorkUuidCursor = colResults.aggregate([
        {
          $sort: {
            "workStatus.started": -1
          }
        },
        {
          $group: {
            _id: "$workJson.uuid",
            results: {
              $push: {
                id: "$_id"
              }
            }
          }
        }
      ]);

      let toDelete = [];

      for await (let resultsForWork of resultsByWorkUuidCursor) {
        while (resultsForWork.results.length > MAX_RESULTS_PER_WORK) {
          let resultToDelete = resultsForWork.results.pop();
          toDelete.push(resultToDelete.id);
        }
      }

      await colResults.deleteMany({ _id: { $in: toDelete } });
    },

    /**
     * @override zx.server.work.scheduler.ISchedulerApi
     * Returns the running work result for the given work UUID,
     * if there is one running.
     *
     * NOTE: ATM, this only works when the scheduler and and pool are running in the same process and thread!
     *
     * @param {string} workUuid
     * @param {boolean} fullData If true, the full WorkResultJson is returned, otherwise WorkResultJsonMin is returned.
     * @returns {Promise<zx.server.work.WorkResult.WorkResultJsonMin|zx.server.work.WorkResult.WorkResultJson|null>}
     */
    async getRunningWorkResult(workUuid, fullData = false) {
      let running = this.__running[workUuid];
      if (!running) {
        return null;
      }
      let poolInfo = this.__poolsByUuid[running.pool.uuid];
      let transport = zx.io.api.ApiUtils.getClientTransport();
      let api = zx.io.api.ApiUtils.createClientApi(zx.server.work.pools.IWorkerPoolApi, transport, poolInfo.apiPath);
      let poolDescription = await api.getDescriptionJson();
      api.dispose();
      let tracker = poolDescription.runningWorkerTrackers.find(tracker => tracker.workResult.workJson.uuid === workUuid);
      if (!tracker?.workResult) {
        return null;
      }
      return fullData ? tracker.workResult : this.__minifyWorkResult(tracker.workResult);
    },

    /**
     *
     * @param {zx.server.work.WorkResult.WorkResultJson} workResult
     * @returns {zx.server.work.WorkResult.WorkResultJsonMin}
     */
    __minifyWorkResult(workResult) {
      let out = qx.lang.Object.clone(workResult);
      out.logLength = out.log.length;
      delete out.log;
      return out;
    },

    /**
     * @override interface zx.server.work.scheduler.ISchedulerApi
     *
     * Gets the log of a work result.
     * @param {string} workResultUuid
     * @param {integer} start Start offset of the log
     * @param {integer} end End offset of the log
     * @returns {Promise<string?>} The log at the requested offsets. If the work result cannot be found, returns null.
     */
    async getWorkLog(workResultUuid, start, end) {
      let [workUuid, startTime] = workResultUuid.split("/");
      startTime = Number.parseInt(startTime);

      let result;

      //First try to see if it is running
      result = await this.getRunningWorkResult(workUuid, true);
      let started = result?.workStatus?.started?.getTime();
      if (started && started == startTime) {
        return result.log.substring(start, end);
      }

      //Then try and find it in the database of past results
      result = await zx.server.Standalone.getInstance()
        .getDb()
        .getCollection("zx.server.work.scheduler.QueueScheduler.WorkResult")
        .findOne(
          {
            "workJson.uuid": workUuid,
            "workStatus.started": new Date(startTime)
          },
          { projection: { log: 1 } }
        );

      if (result) {
        return result.log.substring(start, end);
      } else {
        return null;
      }
    },

    /**
     * @override
     */
    async getQueuedWork() {
      return this.__queue.map(entry => ({
        workJson: entry.workJson
      }));
    },

    /**
     * @override
     */
    getRunningWork() {
      return Object.values(this.__running).map(entry => ({
        workJson: entry.workJson,
        pool: entry.pool
      }));
    },

    /**
     *
     * @param {zx.io.api.server.Request} req
     * @param {zx.io.api.server.Response} res
     * @returns {string}
     */
    getWorkLogRest(req, res) {
      let { workResult: workResultUuid } = req.getQuery();
      return this.getWorkLog(workResultUuid);
    }
  },

  statics: {}
});
