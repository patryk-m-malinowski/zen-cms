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

/**
 * Interface for a scheduler that can be polled for work and notify when work is completed.  This is
 * effectively the Server API for work schedulers.
 *
 * @typedef QueuedWorkJson
 * @property {zx.server.work.IWork.WorkJson} workJson
 *
 * @typedef RunningWorkJson @extends QueuedWorkJson
 * @property {PoolInfo} pool - Information about the pool that is running this work
 *
 */
qx.Interface.define("zx.server.work.scheduler.ISchedulerApi", {
  events: {
    /** Fired when a work item is completed, the data is the serialized JSON from `WorkResult.serializeForScheduler` */
    workCompleted: "qx.event.type.Data"
  },

  members: {
    /**
     * @returns {Promise<zx.server.work.pools.IWorkerPoolApi.PoolInfo>} Information about all the pools
     * registered with this scheduler.
     */
    async getPools() {},

    /**
     * Polls the queue for work to do.  If there is work to do, it is removed from the queue
     *
     * @param {{id: string, uuid: string}} poolInfo Information about the pool that is polling for work, so that we can track which pool is doing the work
     * @return {zx.server.work.IWork.WorkJson?} the work to do, or null if there is no work
     */
    async pollForWork(poolInfo) {},

    /**
     * Called when work is completed.  This should be called by the worker pool when work is completed.
     *
     * @param {zx.server.work.WorkResult.WorkResultJson} workResult the result of the work, serialized to JSON via `zx.server.work.WorkResult.serializeForScheduler()`
     */
    async onWorkCompleted(workResult) {},

    /**
     * @returns {Promise<QueuedWorkJson[]>}
     */
    async getQueuedWork() {},

    /**
     * @returns {Promise<RunningWorkJson[]>}
     */
    async getRunningWork() {},

    /**
     * @see {zx.server.work.scheduler.QueueScheduler.getRunningWorkResult}
     */
    async getRunningWorkResult() {},

    /**
     * @see {zx.server.work.scheduler.QueueScheduler.getPastWorkResults}
     */
    async getPastWorkResults() {},

    /**
     * @see {zx.server.work.scheduler.QueueScheduler.getWorkLog}
     */
    async getWorkLog() {},

    /**
     * @see {zx.server.work.scheduler.QueueScheduler.getWorkLogRest}
     */
    async getWorkLogRest(req, res) {}
  }
});
