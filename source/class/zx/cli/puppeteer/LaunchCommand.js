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
 */
qx.Class.define("zx.cli.puppeteer.LaunchCommand", {
  extend: qx.core.Object,

  properties: {},

  members: {
    async run(flags) {
      let server = new zx.server.puppeteer.WebServer();
      if (flags.port) {
        server.setListenPort(flags.port);
      }
      if (flags["chromium-port"]) {
        server.setChromePort(flags["chromium-port"]);
      }
      await server.start();
    }
  },

  statics: {
    createCliCommand() {
      let cmd = new zx.cli.Command("launch").set({
        description: "Runs the Puppeteer server",
        async runFunc() {
          let launch = new zx.cli.puppeteer.LaunchCommand();
          let { flags } = this.getValues();
          return await launch.run(flags);
        }
      });

      cmd.addFlag(
        new zx.cli.Flag("port").set({
          shortCode: "p",
          description: "Port to listen on",
          type: "integer"
        })
      );

      cmd.addFlag(
        new zx.cli.Flag("chromium-port").set({
          description: "Port for chromium to listen on",
          type: "integer"
        })
      );

      return cmd;
    }
  }
});
