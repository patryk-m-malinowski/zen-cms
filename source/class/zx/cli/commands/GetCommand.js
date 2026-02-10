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

qx.Class.define("zx.cli.commands.GetCommand", {
  extend: qx.core.Object,

  construct(url) {
    super();
    this.__url = url;
  },

  members: {
    __url: null,

    async run() {
      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();

      let url = this.__url;
      if (url[0] != "/") {
        url = "/" + url;
      }
      if (url.endsWith(".html")) {
        let dbUrl = (url = "pages" + url.substring(0, url.length - 5));
        let object = await server.getObjectByUrl(zx.cms.content.Page, dbUrl);
        if (!object) {
          this.error(`Cannot find ${url}`);
          return -1;
        }

        if (!qx.Class.hasInterface(object.constructor, zx.cms.render.IViewable)) {
          this.error(`Cannot render object for ${url} because it is not viewable, it is ${object.classname}: ${object}`);
          return -1;
        }

        let rendering = new zx.cms.render.MemoryRendering();
        await server.getRenderer().renderViewable(rendering, object);
        let body = rendering.getBody();
        if (body) {
          console.log(body);
        } else {
          let filename = rendering.getSrcFilename();
          if (filename) {
            console.log(`Returning file: ${filename}`);
          } else {
            console.log("No data");
            return -1;
          }
        }
        return 0;
      }
    }
  },

  statics: {
    createCliCommand() {
      let cmd = new zx.cli.Command("get").set({
        description: "Gets the resource as the web server would render it",
        async runFunc() {
          let { args } = this.getValues();
          return await new zx.cli.commands.GetCommand(args["url-path"]).run();
        }
      });

      cmd.addArgument(
        new zx.cli.Argument("url-path").set({
          description: "the path to get, must not include http://",
          required: true
        })
      );

      return cmd;
    }
  }
});
