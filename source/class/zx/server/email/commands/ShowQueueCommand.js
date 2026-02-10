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

const { Table } = require("console-table-printer");

/**
 * Command used to show a table of the emails
 */
qx.Class.define("zx.server.email.commands.ShowQueueCommand", {
  extend: zx.cli.Command,
  construct() {
    super("show-queue");

    this.addFlag(
      new zx.cli.Flag("failed-only").set({
        description: "Only show emails which have failed to send.",
        type: "boolean",
        required: false,
        value: false
      })
    );

    this.setRunFunc(async ({ flags }) => {
      await new zx.server.Standalone().start();
      await this.__showQueue(flags["failed-only"]);
      return 0;
    });
  },

  members: {
    async __showQueue(showFailedOnly) {
      const Util = zx.server.email.commands.Util;
      let emails = await Util.getAllEmailsJson();

      if (showFailedOnly) {
        emails = emails.filter(email => email.sendAttempts > 0);
      }

      if (emails.length == 0) {
        console.log("No emails in queue");
        return;
      }

      const tbl = new Table({
        columns: [
          { name: "userId", title: "#", alignment: "left", color: "red" },
          { name: "_uuid", title: "UUID", alignment: "left" },
          { name: "dateQueued", title: "Date Queued", alignment: "left" },
          { name: "to", title: "To", alignment: "left" },
          { name: "sendAttempts", title: "Send Attempts", alignment: "right" }
        ],
        enabledColumns: ["userId", "_uuid", "dateQueued", "to", "sendAttempts"]
      });

      tbl.addRows(emails);
      tbl.printTable();
    }
  }
});
