/**
 * Proxy object representing a work result.
 * A work result can either represent a work that is currently running or one that has completed in the past.
 * Its uuid is workJson.uuid + "/" + UNIX timestamp of when the work started
 */
qx.Class.define("zx.server.work.ui.model.WorkResult", {
  extend: qx.core.Object,
  /**
   * @private To get WorkResult objects, use `WorkResult.get`
   * @param {zx.server.work.WorkResult.WorkResultJson?} workResultJson
   */
  construct(workResultJson) {
    super();
    this.setExplicitUuid(this.constructor.getUuid(workResultJson));
    if (workResultJson) {
      this.__update(workResultJson);
    }

    this.__debounceUpdateLog = new qx.util.Debounce(() => this.__updateLogImpl(), 0).set({ onRunning: "queue" });
  },
  properties: {
    /**
     * Name of work.
     */
    title: {
      check: "String",
      event: "changeTitle",
      init: null,
      nullable: true
    },
    /**
     * Description of work.
     */
    description: {
      check: "String",
      event: "changeDescription",
      init: null,
      nullable: true
    },
    workClassname: {
      check: "String",
      event: "changeWorkClassname"
    },
    /**
     * @type {zx.server.work.IWork.WorkJson}
     */
    workJson: {
      check: "Object",
      event: "changeWorkJson"
    },
    logOutput: {
      check: "String",
      event: "changeLogOutput",
      init: ""
    },
    started: {
      check: "Date",
      event: "changeStarted"
    },
    completed: {
      check: "Date",
      event: "changeCompleted",
      init: null,
      nullable: true,
      apply: "_updateDerivedProps"
    },
    exceptionStack: {
      check: "String",
      event: "changeExceptionStack",
      apply: "_updateDerivedProps",
      init: null,
      nullable: true
    },
    success: {
      check: "Boolean",
      event: "changeSuccess",
      init: null,
      nullable: true
    },

    //Only set when the work is running
    tracker: {
      check: "zx.server.work.ui.model.WorkerTracker",
      event: "changeTracker",
      init: null,
      nullable: true
    },
    /**
     * If the task was killed by the user in the user by calling the `kill` method
     */
    userKilled: {
      check: "Boolean",
      event: "changeUserKilled",
      init: false
    },

    /**
     * The scheduler that produced this work result
     */
    scheduler: {
      check: "zx.server.work.ui.model.Scheduler",
      init: null
    },

    /**
     * The length of the log output that the server reports.
     *
     * When we call __update, we get the length of the log that the server has.
     * If we call updateLog, and this.__logLength > this.__hasLogLength (i.e. we need to download some new log messages),
     * we download the new log messages from the server,
     * and then we update this.__hasLogLength.
     * Note: To save memory and CPU, we don't store the full log (it's limited to 1000 characters).
     * These values are just pointers so we can keep track of the log;
     * they don't represent the full length of the log we have.
     *
     */
    __logLength: {
      check: "Integer",
      init: -1,
      event: "changeLogLength"
    }
  },
  statics: {
    /**
     * @type {Object<string, zx.server.work.ui.model.WorkResult>} Key is UUID, value is WorkResult instance
     */
    __instances: {},

    /**
     *
     * @param {string|zx.server.work.WorkResult.WorkResultJson} json
     * @returns {zx.server.work.ui.model.WorkResult}
     */
    get(json) {
      let uuid = typeof json === "string" ? json : this.getUuid(json);
      let instance = this.__instances[uuid];
      if (!instance) {
        instance = new zx.server.work.ui.model.WorkResult(json);
      } else {
        instance.__update(json);
      }

      this.__instances[uuid] = instance;
      return instance;
    },

    /**
     *
     * @param {zx.server.work.WorkResult.WorkResultJson} workResultJson
     * @returns {string} The UUID to assign to a work result based on its workJson
     */
    getUuid(workResultJson) {
      return workResultJson.workJson.uuid + "/" + workResultJson.workStatus.started.getTime();
    }
  },
  members: {
    /**
     * @type {qx.util.Debounce}
     * Use a debounce so we update the logs again when we request to update the logs while this work result is fetching data from the server.
     * This debounce has a timeout of 0, meaning it's not used to batch the calls.
     */
    __debounceUpdateLog: null,

    /**
     * The length of the log output that this object has in memory
     */
    __hasLogLength: 0,

    /**
     * Downloads new log data from the server
     * and trims the log if it exceeds the limit.
     */
    updateLog() {
      this.__debounceUpdateLog.trigger();
    },

    _updateDerivedProps() {
      this.setSuccess(this.getCompleted() ? !this.getExceptionStack() : null);
    },
    /**
     *
     * @param {zx.server.work.WorkResult.WorkResultJson} workResultJson
     */
    __update(workResultJson) {
      this.set({
        title: workResultJson.workJson.title ?? null,
        description: workResultJson.workJson.description ?? null,
        workJson: workResultJson.workJson,
        workClassname: workResultJson.workJson.workClassname,
        started: workResultJson.workStatus?.started ?? null,
        completed: workResultJson.workStatus?.completed ?? null,
        exceptionStack: workResultJson.response?.exceptionStack ?? workResultJson.response?.exception ?? null,
        scheduler: zx.server.work.ui.model.Scheduler.get(workResultJson.schedulerId ?? "scheduler") // for now, we assume that there is only one scheduler
      });

      this.__logLength = workResultJson.logLength;
    },

    async __updateLogImpl() {
      if (this.__logLength == this.__hasLogLength) return;

      const MAX_LENGTH = 10000;
      //ensure we only download just enough data that fits inside MAX_LENGTH
      if (this.__logLength - this.__hasLogLength > MAX_LENGTH) {
        this.__hasLogLength = this.__logLength - MAX_LENGTH;
      }
      let newData = await this.getScheduler().getApi().getWorkLog(this.toUuid(), this.__hasLogLength, this.__logLength);
      if (!newData) return; //if it's null, this means that the task isn't running anymore
      let newLog = this.getLogOutput() + newData;
      this.setLogOutput(newLog.substring(newLog.length - MAX_LENGTH, newLog.length));
      this.__hasLogLength = this.__logLength;
    },

    async kill() {
      if (this.getUserKilled()) {
        throw new Error("Work already killed by user");
      }
      this.setUserKilled(true);
      await this.getTracker().getPool().getApi().killWork(this.getWorkJson().uuid);
    }
  }
});
