/**
 * Stores global user settings for the ZX Scheduler Manager
 */
qx.Class.define("zx.server.work.ui.UserData", {
  extend: qx.core.Object,
  type: "singleton",
  properties: {
    /**
     * @type {qx.data.Array<string>} array of UUIDs of starred work results
     */
    starredWorkResults: {
      check: "qx.data.Array",
      event: "changeStarredWorkResults",
      initFunction: () => new qx.data.Array()
    }
  }
});
