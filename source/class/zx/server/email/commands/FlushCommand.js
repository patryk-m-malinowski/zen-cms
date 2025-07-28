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
 * Command to flush the email queue.
 *
 * This command will attempt to send all emails in the queue, and remove the emails that have been successfully sent (if the clear-queue flag is set).
 */
qx.Class.define("zx.server.email.commands.FlushCommand", {
  extend: zx.cli.Command,
  construct() {
    super("flush");

    this.addFlag(
      new zx.cli.Flag("clear-queue").set({
        description: "Clear queue after sending?",
        type: "boolean",
        required: false,
        value: true
      })
    );

    this.setRunFunc(async ({ flags, args }) => {
      await new zx.server.Standalone().start();

      let flushObj = new zx.server.email.FlushQueue();
      await flushObj.run(flags["clear-queue"]);
      console.log("Done.");
      return 0;
    });
  },

  members: {}
});
