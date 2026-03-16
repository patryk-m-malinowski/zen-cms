qx.Class.define("zx.server.work.ui.model.ListOfSchedulers", {
  extend: qx.core.Object,

  construct() {
    super();
    this.__children = new qx.data.Array([zx.server.work.ui.model.Scheduler.get("scheduler")]);
  },
  members: {
    /**
     *
     * @returns {qx.data.Array<zx.server.work.ui.model.Scheduler>}
     */
    getChildren() {
      return this.__children;
    }
  }
});
