qx.Class.define("zx.server.api.SessionApi", {
  extend: zx.server.Object,
  "@": new zx.io.remote.anno.Class(),

  members: {
    /**
     * Deletes the current session
     */
    "@deleteSession": zx.io.remote.anno.Method.DEFAULT,
    async deleteSession(uuid) {
      //
    }
  }
});
