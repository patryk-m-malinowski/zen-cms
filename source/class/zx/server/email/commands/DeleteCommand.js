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

const readline = require("readline/promises");
/**
 * Command used to composed and put an email into the queue
 */
qx.Class.define("zx.server.email.commands.DeleteCommand", {
  extend: zx.cli.Command,
  construct() {
    super("delete");

    this.addArgument(
      new zx.cli.Argument("id").set({
        description: "User ID or UUID of Email To Delete",
        type: "string",
        required: false
      })
    );

    this.addFlag(
      new zx.cli.Flag("skip-confirm").set({
        description: "Skip user confirmation",
        type: "boolean",
        value: false
      })
    );

    this.setRunFunc(async ({ flags, args }) => {
      await new zx.server.Standalone().start();
      if (args.id) {
        await this.__deleteOne(args.id);
      } else {
        const reader = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        let confirm;
        if (flags["skip-confirm"]) {
          confirm = true;
        } else {
          confirm = (await reader.question("Are you sure you want to delete all emails? (yes/[no]) ")) === "yes";
        }

        if (confirm) {
          await this.__deleteAll();
        } else {
          console.log("Abort.");
          return 0;
        }
      }
      console.log("Done.");
      return 0;
    });

    return this;
  },

  members: {
    async __deleteOne(userId) {
      const Util = zx.server.email.commands.Util;

      let emailUuid;
      if (/^[0-9]+$/.test(userId)) {
        emailUuid = await Util.getEmailUuidByUserId(userId);
      } else {
        emailUuid = userId;
      }

      let server = zx.server.Standalone.getInstance();
      await server.deleteObjectsByType(zx.server.email.Message, { _uuid: emailUuid });
    },

    async __deleteAll() {
      let server = zx.server.Standalone.getInstance();
      await server.deleteObjectsByType(zx.server.email.Message, {});
    }
  }
});
