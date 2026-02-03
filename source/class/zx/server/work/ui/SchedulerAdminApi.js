/**
 * This class provides a thick-client API for managing and querying the work scheduler,
 * including accessing actual ScheduledTask objects as remote objects.
 */
qx.Class.define("zx.server.work.ui.SchedulerAdminApi", {
  extend: zx.server.Object,

  members: {
    /**
     * Gets (creates if needed) a scheduled task by its wellknown ID.  If freshly created, it is disabled by default.
     *
     * @param {String} wellKnownId the wellknown ID to find/create
     * @param {String} title the title for the task
     * @param {String} workJson classname of the work to run
     * @returns {Promise<zx.server.work.scheduler.ScheduledTask>} the scheduled task
     */
    "@getOrCreateTaskByWellKnownId": zx.io.remote.anno.Method.DEFAULT,
    async getOrCreateTaskByWellKnownId(wellKnownId, title, workJson) {
      let task = await zx.server.Standalone.getInstance().findOneObjectByType(zx.server.work.scheduler.ScheduledTask, { wellKnownId });
      if (!task) {
        task = new zx.server.work.scheduler.ScheduledTask();
        task.set({
          wellKnownId,
          title,
          enabled: false,
          workJson
        });
        await task.save();
      } else {
        task.set({
          title,
          workJson
        });
        await task.save();
      }
      return task;
    }
  }
});
