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

const fs = require("fs").promises;

/**
 * Command used to compose an email and save it the queue
 */
qx.Class.define("zx.server.email.commands.ComposeCommand", {
  extend: zx.cli.Command,
  construct() {
    super("compose");

    this.addFlag(
      new zx.cli.Flag("from").set({
        description: "Email address of sender",
        type: "string",
        required: true
      })
    );
    this.addFlag(
      new zx.cli.Flag("to").set({
        description: "Email address of receiver",
        type: "string",
        required: true
      })
    );
    this.addFlag(
      new zx.cli.Flag("subject").set({
        description: "Subject",
        type: "string",
        required: false
      })
    );
    this.addFlag(
      new zx.cli.Flag("text-body").set({
        description: "Text Body",
        type: "string",
        required: false
      })
    );
    this.addFlag(
      new zx.cli.Flag("html-body").set({
        description: "HTML Body",
        type: "string",
        required: false
      })
    );

    this.setRunFunc(async ({ flags }) => {
      await new zx.server.Standalone().start();
      let htmlBody = flags["html-body"] ? await fs.readFile(flags["html-body"], "utf8") : null;
      let textBody = flags["text-body"] ? await fs.readFile(flags["text-body"], "utf8") : null;
      let message = new zx.server.email.Message().set({
        from: flags.from,
        to: flags.to,
        subject: flags.subject,
        textBody,
        htmlBody
      });
      await message.save();
      console.log("Done.");
      return 0;
    });
  }
});
