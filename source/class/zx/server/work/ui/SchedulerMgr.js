/**
 * UI for managing schedulers, pools, and workers.
 */
qx.Class.define("zx.server.work.ui.SchedulerMgr", {
  extend: qx.ui.core.Widget,
  /**
   *
   * @param {zx.io.api.client.AbstractClientTransport} transport The transport used to commiunicate with the scheduler server.
   */
  construct(transport) {
    super();
    this.__transport = transport;
    zx.server.work.ui.SchedulerMgr.__transport = transport;
    this._setLayout(new qx.ui.layout.Grow());
    this._add(this.getQxObject("tabView"));
  },

  objects: {
    tabView() {
      let tabView = new qx.ui.tabview.TabView();
      tabView.add(this.getQxObject("pageTasks"));
      tabView.add(this.getQxObject("pageSchedulers"));
      return tabView;
    },
    pageSchedulers() {
      let pg = new qx.ui.tabview.Page("Scheduler View");
      pg.add(this.getQxObject("schedulersView"));
      pg.setLayout(new qx.ui.layout.Grow());
      return pg;
    },
    pageTasks() {
      let pg = new qx.ui.tabview.Page("Tasks View");
      pg.add(this.getQxObject("tasksView"));
      pg.setLayout(new qx.ui.layout.Grow());
      return pg;
    },
    schedulersView() {
      return new zx.server.work.ui.SchedulersView();
    },
    tasksView() {
      return new zx.server.work.ui.TasksView();
    }
  },
  members: {
    /**
     * @type {zx.io.api.client.AbstractClientTransport}
     */
    __transport: null
  },
  statics: {
    /**
     * @type {zx.io.api.client.AbstractClientTransport}
     */
    __transport: null,
    /**
     *
     * @returns {zx.io.api.client.AbstractClientTransport}
     */
    getTransport() {
      if (qx.core.Environment.get("qx.debug")) {
        if (!zx.server.work.ui.SchedulerMgr.__transport) {
          throw new Error("Transport not available yet. You need to instantiate the SchedulerMgr first.");
        }
      }
      return zx.server.work.ui.SchedulerMgr.__transport;
    }
  }
});
