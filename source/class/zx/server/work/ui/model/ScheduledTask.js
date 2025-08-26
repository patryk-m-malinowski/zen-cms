qx.Class.define("zx.server.work.ui.model.ScheduledTask", {
  extend: qx.core.Object,
  /**
   * @private To prevent duplicate instances, use `zx.server.work.ui.model.ScheduledTask.get`
   * @param {zx.server.work.scheduler.ITasksApi} api
   * @param {zx.server.work.scheduler.ScheduledTask.DescriptionJson} json
   */
  construct(api, json) {
    super();
    this.__api = api;
    this.setExplicitUuid(json.uuid);
    this.__update(json);
  },

  properties: {
    title: {
      check: "String",
      event: "changeTitle",
      init: null,
      nullable: true
    },
    description: {
      check: "String",
      event: "changeDescription",
      nullable: true,
      init: null
    },
    workJson: {
      check: "Object",
      event: "changeWorkJson"
    },
    /**
     * @type {qx.data.Array<zx.server.work.ui.model.WorkResult>}
     * Both past and currently-running work results for this task (if there is a current).
     * There is no defined order for this array.
     */
    workResults: {
      check: "qx.data.Array",
      event: "changeWorkResults",
      init: () => new qx.data.Array()
    },
    dateStarted: {
      check: "Date",
      event: "changeDateStarted",
      nullable: true,
      init: null
    },
    dateCompleted: {
      check: "Date",
      event: "changeDateCompleted",
      nullable: true,
      init: null
    },
    runningWorkResult: {
      check: "zx.server.work.ui.model.WorkResult",
      event: "changeRunningWorkResult",
      nullable: true,
      init: null
    },
    status: {
      check: ["idle", "queued", "running"],
      init: "idle",
      event: "changeStatus"
    },
    success: {
      check: "Boolean",
      event: "changeSuccess",
      init: null,
      nullable: true
    }
  },
  objects: {},
  members: {
    /**
     * @type {zx.server.work.scheduler.ITasksApi}
     */
    __api: null,
    async queue() {
      await this.__api.queueTask(this.toUuid());
    },

    async refreshWorkResults() {
      let api = this.__api;
      let thisJson = (await api.searchTasks({ uuid: this.toUuid() }))[0];
      if (thisJson) {
        this.__update(thisJson);
      }
      let past = await api.getPastWorkResults(this.toUuid());
      let currentJson = await api.getRunningWorkResult(this.toUuid());
      let current = currentJson ? zx.server.work.ui.model.WorkResult.get(currentJson) : null;
      this.setRunningWorkResult(current);
      if (currentJson && !this.getWorkResults().includes(current)) {
        this.getWorkResults().unshift(current);
      }
      for (let resultJson of past) {
        let result = zx.server.work.ui.model.WorkResult.get(resultJson).set({ tracker: null });
        if (!this.getWorkResults().includes(result)) {
          this.getWorkResults().push(result);
        }
      }
    },
    /**
     *
     * @param {zx.server.work.ui.model.ScheduledTask.DescriptionJson} json
     */
    __update(json) {
      this.setStatus(json.status);
      this.setTitle(json.title ?? null);
      this.setDescription(json.description ?? null);
      this.setWorkJson(json.workJson);
      this.setDateStarted(json.dateStarted ?? null);
      this.setDateCompleted(json.dateCompleted ?? null);
      this.setSuccess(json.status == "idle" ? !json.failCount : null);
    }
  },
  statics: {
    /**
     * @type {Object<string, zx.server.work.ui.model.ScheduledTask>} Key is UUID, value is WorkResult instance
     */
    __instances: {},

    /**
     * Gets or creates a ScheduledTask instance for the given UUID or JSON
     * @param {zx.server.work.scheduler.ITasksApi}
     * @param {string|zx.server.work.ui.model.ScheduledTask.DescriptionJson} json
     * @returns {zx.server.work.ui.model.ScheduledTask}
     */
    get(api, json) {
      let uuid = typeof json === "string" ? json : json.uuid;
      let instance = this.__instances[uuid];
      if (!instance) {
        instance = new zx.server.work.ui.model.ScheduledTask(api, json);
      } else {
        instance.__update(json);
      }
      this.__instances[uuid] = instance;
      return instance;
    }
  }
});
