/**
 * API used for searching and managing scheduled tasks.
 */
qx.Interface.define("zx.server.work.scheduler.ITasksApi", {
  members: {
    /**
     * Queues a task for execution.
     * @param {string} uuid
     */
    async queueTask(uuid) {},

    /**
     *
     * @param {Query} query
     * @returns {Promise<zx.server.work.scheduler.ScheduledTask.DescriptionJson[]>}
     *
     * @typedef Query
     * @property {string?} text - Text search
     * @property {string?} uuid - The UUID of the task to search for
     * @property {boolean?} runningOnly - If true, includes only tasks which are either queued or running.
     * @property {number?} maxResults - The maximum number of results to return. If not specified, all results are returned.
     * If runningOnly is true, this will be ignored and all running tasks will be returned.
     */
    async searchTasks(query) {},

    /**
     * @see(zx.server.work.scheduler.DbScanner.getRunningWorkResult)
     */
    async getRunningWorkResult(taskUuid) {},

    /**
     * @see(zx.server.work.scheduler.DbScanner.getPastWorkResults)
     */
    async getPastWorkResults(taskUuid) {}
  }
});
