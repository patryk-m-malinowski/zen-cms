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

/**
 * Command used to composed and put an email into the queue
 */
qx.Class.define("zx.server.email.commands.SendCommand", {
  extend: zx.cli.Command,
  construct() {
    super("send");

    this.addArgument(
      new zx.cli.Argument("id").set({
        description: "User ID or UUID of Email To Send",
        type: "string",
        required: true
      })
    );

    this.addFlag(
      new zx.cli.Flag("delete-from-queue").set({
        description: "Delete email from queue after sending?",
        type: "boolean",
        required: false,
        value: true
      })
    );

    this.setRunFunc(async ({ flags, args }) => {
      await new zx.server.Standalone().start();
      await this.__doit(args.id, flags["delete-from-queue"]);
      console.log("Done.");
      return 0;
    });

    return this;
  },

  members: {
    async __doit(userId, deleteFromQueue = true) {
      const Util = zx.server.email.commands.Util;

      let emailUuid;
      if (/^[0-9]+$/.test(userId)) {
        emailUuid = await Util.getEmailUuidByUserId(userId);
      } else {
        emailUuid = userId;
      }

      let server = zx.server.Standalone.getInstance();
      let email = await server.findOneObjectByType(zx.server.email.Message, { _uuid: emailUuid });

      let success = await email.sendEmail();

      if (success && deleteFromQueue) {
        let server = zx.server.Standalone.getInstance();
        await server.deleteObject(email);
      }

      if (!success) {
        console.error(`Failed to send email ${email.toUuid()}. Message: ${email.getLastErrorMessage()}`);
      }
    }
  }
});
