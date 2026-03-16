/**
 * A proxy object representing a worker pool.
 */
qx.Class.define("zx.server.work.ui.model.WorkerPool", {
  extend: qx.core.Object,
  /**
   * @param {zx.server.work.ui.model.Scheduler} scheduler
   * @param {zx.server.work.pools.IWorkerPoolApi.PoolInfo} poolJson
   */
  construct(scheduler, poolJson) {
    super();
    this.__scheduler = scheduler;
    this.__trackersByUuid = {};
    this.__workResults = new qx.data.Array();

    this.setExplicitUuid(poolJson.uuid);
    this.setTitle(poolJson.classname);
    this.setId(poolJson.classname);

    let transport = zx.server.work.ui.SchedulerMgr.getTransport();
    this.__api = zx.io.api.ApiUtils.createClientApi(zx.server.work.pools.IWorkerPoolApi, transport, poolJson.apiPath);

    const REFRESH_INTERVAL = 2000; // 2 seconds

    this.__timeoutRefreshChildren = new zx.utils.Timeout(REFRESH_INTERVAL, this.__refreshChildren, this).set({
      enabled: false,
      recurring: true
    });
  },

  destruct() {
    this.__timeoutRefreshChildren.dispose();
  },

  properties: {
    /**
     * Computer-friendly unique identifier of the pool.
     */
    id: {
      check: "String",
      event: "changeId"
    },
    /**
     * Human-readable title of the pool
     */
    title: {
      check: "String",
      event: "changeTitle"
    }
  },

  events: {
    changeWorkResults: "qx.event.type.Data"
  },

  members: {
    /**
     * @type {zx.server.work.ui.model.Scheduler}
     */
    __scheduler: null,
    /**
     * @type {zx.server.work.pools.IWorkerPoolApi}
     */
    __api: null,

    /**
     * @type {qx.data.Array<zx.server.work.ui.model.WorkerTracker>}
     */
    __children: null,

    /**
     * @type {Promise<qx.data.Array<zx.server.work.ui.model.WorkerTracker>>}
     */
    __promiseLoadChildren: null,

    /**
     * @type {Object<string, zx.server.work.ui.model.WorkerTracker>}
     */
    __trackersByUuid: null,

    /**
     * @type {qx.data.Array<zx.server.work.ui.model.WorkResult>}
     * Work results for all trackers in this pool.
     */
    __workResults: null,

    /**
     *
     * @returns {zx.server.work.ui.model.Scheduler}
     */
    getScheduler() {
      return this.__scheduler;
    },

    /**
     * @returns {zx.server.work.pools.IWorkerPoolApi}
     */
    getApi() {
      return this.__api;
    },

    /**
     *
     * @returns {qx.data.Array<zx.server.work.ui.model.WorkResult>}
     */
    getWorkResults() {
      return this.__workResults;
    },

    /**
     * Gets the worker trackers in this pool.
     * Returns a promise if the data is not yet available, or a ready value if it is.
     * @returns {qx.data.Array<zx.server.work.ui.model.WorkerTracker> | Promise<qx.data.Array<zx.server.work.ui.model.WorkerTracker>>}
     */
    getChildren() {
      const doit = async () => {
        await this.__refreshChildren();
        this.__promiseLoadChildren = null;
        this.__timeoutRefreshChildren.setEnabled(true);
        return this.__children;
      };

      if (this.__children) {
        return this.__children;
      }

      if (!this.__promiseLoadChildren) {
        this.__promiseLoadChildren = doit();
      }
      return this.__promiseLoadChildren;
    },

    /**
     * Downloads the data relating to this pool and worker trackers
     * and updats its list of children.
     */
    async __refreshChildren() {
      let description = await this.__api.getDescriptionJson();
      let unusedTrackers = this.__children?.copy() ?? new qx.data.Array();
      let children = this.__children ?? new qx.data.Array();

      for (let trackerJson of description.runningWorkerTrackers) {
        let tracker = this.__trackersByUuid[trackerJson.uuid];
        if (!tracker) {
          tracker = new zx.server.work.ui.model.WorkerTracker(this, trackerJson);
          tracker.setExplicitUuid(trackerJson.uuid);
          children.push(tracker);
          this.__workResults.push(tracker.getWorkResult());
          this.__trackersByUuid[trackerJson.uuid] = tracker;
        } else {
          tracker.update(trackerJson);
        }
        unusedTrackers.remove(tracker);
      }

      unusedTrackers.forEach(tracker => {
        children.remove(tracker);
        if (!this.__workResults.remove(tracker.getWorkResult())) {
          throw new Error("Cannot find worker result for tracker in pool.");
        }

        delete this.__trackersByUuid[tracker.toUuid()];
        tracker.dispose();
      });

      if (!this.__children) {
        this.__children = children;
      }
    }
  }
});
