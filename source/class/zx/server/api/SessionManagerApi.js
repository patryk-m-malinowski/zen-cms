qx.Class.define("visionmedia.leaflets.LeafletApi", {
  extend: zx.server.Object,
  implement: [zx.io.remote.IUploadReceiver],
  "@": zx.io.remote.anno.Class.DEFAULT,

  members: {
    getActiveSessions() {
      let sessionsJson = [];
      return sessionsJson;
    }
  }
});
