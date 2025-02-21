qx.Class.define("zx.demo.server.work.nodeworkers.NodeWorkerApp", {
  extend: qx.application.Basic,

  members: {
    async main() {
      let pool = new zx.server.work.pools.NodeThreadWorkerPool({
        minSize: 0,
        maxSize: 2
      });

      let schedulerClientTransport = new zx.io.api.transport.loopback.LoopbackClientTransport();
      let schedulerServerTransport = new zx.io.api.transport.loopback.LoopbackServerTransport();
      schedulerClientTransport.connect(schedulerServerTransport);
      schedulerServerTransport.connect(schedulerClientTransport);

      let scheduler = new zx.server.work.scheduler.QueueScheduler();
      zx.io.api.server.ConnectionManager.getInstance().registerApi(scheduler.getServerApi(), "/scheduler");

      let schedulerClientApi = new zx.io.api.client.GenericClientApiProxy(zx.server.work.scheduler.ISchedulerApi, schedulerClientTransport, "/scheduler");
      pool.setSchedulerApi(schedulerClientApi);

      scheduler.pushWork({
        uuid: "fb339301-3f9c-45ed-a774-7bf0a026c5eb",
        classname: zx.demo.server.work.TestWork.classname,
        compatibility: [],
        args: []
      });

      scheduler.pushWork({
        uuid: "e32a5baa-470d-40c5-a9d4-2ccced32f75f",
        classname: zx.demo.server.work.TestWork.classname,
        compatibility: [],
        args: []
      });

      scheduler.addListener("complete", e => {
        console.log('schedulerServer.addListener("complete")', e.getData());
      });

      await pool.startup();
    },

    finalize() {},

    close() {},

    terminate() {}
  }
});
