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

qx.Class.define("zx.cli.commands.ShortenCommand", {
  extend: qx.core.Object,

  statics: {
    createCliCommand() {
      let cmd = new zx.cli.Command("url-shorten").set({
        description: "Shortens a string",
        async runFunc() {
          let { args } = this.getValues();
          let result = zx.cms.website.ShortUrl.shorten(args["value"]);
          console.log("Shorted to: " + result);
        }
      });

      cmd.addArgument(
        new zx.cli.Argument("value").set({
          description: "the value to shorten",
          required: true
        })
      );

      return cmd;
    }
  }
});
