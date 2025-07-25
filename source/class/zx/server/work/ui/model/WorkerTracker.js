/**
 * Proxy object representing a worker tracker (a worker pool has multiple workers managed by worker trackers)
 */
qx.Class.define("zx.server.work.ui.model.WorkerTracker", {
  extend: qx.core.Object,

  /**
   * @param {zx.server.work.ui.model.WorkerPool} pool The pool this tracker
   * @param {zx.server.work.WorkerTracker.DescriptionJson} trackerJson Information describing this tracker
   */
  construct(pool, trackerJson) {
    super();
    this.__pool = pool;
    this.initWorkResult(new zx.server.work.ui.model.WorkResult(this, trackerJson.workResult));
    this.update(trackerJson);
  },

  properties: {
    title: {
      check: "String",
      event: "changeTitle",
      init: null
    },
    status: {
      check: ["waiting", "running", "stopped", "killing", "dead"],
      event: "changeStatus",
      apply: "__updateTitle"
    },
    lastActivity: {
      check: "Date",
      event: "changeLastActivity",
      init: null,
      nullable: true
    },
    workResult: {
      check: "zx.server.work.ui.model.WorkResult",
      event: "changeWorkResult",
      deferredInit: true
    }
  },
  members: {
    /**
     * @type {zx.server.work.ui.model.WorkerPool}
     */
    __pool: null,

    /**
     * @returns {zx.server.work.ui.model.WorkerPool}
     */
    getPool() {
      return this.__pool;
    },
    /**
     *
     * @param {zx.server.work.WorkerTracker.DescriptionJson} trackerJson
     */
    update(trackerJson) {
      this.setStatus(trackerJson.status);
      this.setLastActivity(trackerJson.lastActivity ?? null);
      this.getWorkResult().update(trackerJson.workResult);
    },

    __updateTitle() {
      let out = `Worker Tracker: ${this.toHashCode()}`;
      if (this.getStatus() == "running") {
        out += ` Running: ${this.getWorkResult().getWorkJson().workClassname}`;
      }
      this.setTitle(out);
    }
  }
});
