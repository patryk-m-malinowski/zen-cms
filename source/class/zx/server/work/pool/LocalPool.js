/* ************************************************************************
 *
 *  Zen [and the art of] CMS
 *
 *  https://zenesis.com
 *
 *  Copyright:
 *    2019-2022 Zenesis Ltd, https://www.zenesis.com
 *
 *  License:
 *    MIT (see LICENSE in project root)
 *
 *  Authors:
 *    Will Johnson (@willsterjohnson)
 *
 * ************************************************************************ */

/**
 * The local pool runs work in the same main thread as the pool
 */
qx.Class.define("zx.server.work.pool.LocalPool", {
  extend: zx.server.work.AbstractWorkerPool,
  implement: [zx.server.work.IWorkerFactory],

  construct() {
    super();
    this.__workerMap = new Map();
    this.getQxObject("pool").setFactory(this);
  },

  members: {
    /**@type {Map<zx.server.work.api.WorkerClientApi, zx.server.work.api.WorkerServerApi>} */
    __workerMap: null,

    /**
     * @override
     */
    async create() {
      let apiPath = this._createPath("workerApi");

      let serverTransport = new zx.io.api.transport.loopback.LoopbackServerTransport();
      let clientTransport = new zx.io.api.transport.loopback.LoopbackClientTransport();

      serverTransport.connect(clientTransport);
      clientTransport.connect(serverTransport);

      let server = new zx.server.work.api.WorkerServerApi(apiPath);
      let client = new zx.server.work.api.WorkerClientApi(clientTransport, apiPath);

      this.__workerMap.set(client, server);

      await client.subscribe("log", this._onLog.bind(this));
      await client.subscribe("complete", this._onComplete.bind(this));

      return client;
    },

    /**
     * @override
     */
    async destroy(client) {
      let server = this.__workerMap.get(client);
      server.dispose();
      this.__workerMap.delete(client);
      client.terminate();
      client.dispose();
    }
  }
});
