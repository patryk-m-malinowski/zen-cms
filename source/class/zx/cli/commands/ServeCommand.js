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
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************ */

/**
 * @use(zx.server.WebServer)
 * @use(zx.test.io.remote.RemoteWindowChildFeature)
 * @use(zx.test.io.remote.RemoteThinXhrFeature)
 */
qx.Class.define("zx.cli.commands.ServeCommand", {
  extend: zx.cli.Command,

  construct() {
    super("serve");

    this.set({
      description: "Runs the CMS Web Server",
      runFunc: async () => await this.run()
    });

    this.addFlag(
      new zx.cli.Flag("port").set({
        shortCode: "p",
        description: "Port to listen on",
        type: "integer"
      })
    );
  },

  environment: {
    "zx.cli.ServeCommand.serverClassname": "zx.server.WebServer"
  },

  members: {
    __url: null,

    async run() {
      let { flags } = this.getValues();
      let config = await zx.server.Config.getConfig();

      let classname = qx.core.Environment.get("zx.cli.ServeCommand.serverClassname");
      let clazz = qx.Class.getByName(classname);
      let server = new clazz();
      let port = flags.port || config.port;
      if (port) {
        server.setListenPort(port);
      }
      await server.start();
      return null;
    }
  },

  statics: {
    createCliCommand() {
      return new zx.cli.commands.ServeCommand();
    }
  }
});
