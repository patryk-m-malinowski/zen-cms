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
 * This class provides a method for flushing the email queue and sending the emails.
 */
qx.Class.define("zx.server.email.FlushQueue", {
  extend: qx.core.Object,
  implement: [zx.server.work.IWork],
  members: {
    /**
     * Flushes the email queue and attempts to send all emails which have not failed to send i.e. have `lastErrorMessage` set to `null`.
     *
     * @param {boolean} clearQueue If true, we will delete emails that have been successfully sent from the queue.
     *  Otherwise, all emails (even the sent ones) will remain in the queue.
     */
    async execute(worker, clearQueue = true) {
      let emailsCollection = await zx.server.Standalone.getInstance().getDb().getCollection("zx.server.email.Message");
      worker.appendWorkLog("Got emails collection.");

      let emailsCursor = await emailsCollection.find({ lastErrorMessage: null, dateDelivered: null });
      worker.appendWorkLog("Got emails cursor.");

      let sentUuids = [];

      //we will set this to true if any email fails to send
      let error = false;

      for await (let emailJson of emailsCursor) {
        let email = await zx.server.Standalone.getInstance()
          .findOneObjectByType(zx.server.email.Message, { _uuid: emailJson._uuid }, false)
          .catch(e => {
            worker.appendWorkLog(`Error getting email as ZX server Object ${emailJson._uuid}: ${e}. Skipping...`);
            error = true;
            return null;
          });

        if (!email) {
          continue;
        }
        worker.appendWorkLog(`Before sending email ${email.toUuid()}.`);
        email.clearLog();
        let listener = email.addListener("log", e => worker.appendWorkLog(e.getData().message));
        try {
          await email.sendEmail();
          worker.appendWorkLog(`Email ${email.toUuid()} sent successfully`);
          sentUuids.push(email.toUuid());
        } catch (e) {
          error = true;
        }
        email.removeListenerById(listener);
        worker.appendWorkLog(`After sending email ${email.toUuid()}.`);
      }

      worker.appendWorkLog("Traversed email queue.");
      if (clearQueue) {
        let server = zx.server.Standalone.getInstance();
        await server.deleteObjectsByType(zx.server.email.Message, { _id: { $in: sentUuids } });
      }
      worker.appendWorkLog("Email queue flushed");

      if (error) {
        throw new Error("Some emails failed to send, see logs for details");
      }
    },
    /**@override*/
    async abort(worker) {}
  },

  statics: {
    /**
     * Creates the tasks which flushes the email queue,
     * if there isn't one already
     */
    async createTask() {
      let query = {
        wellKnownId: "zx.server.email.FlushQueue",
        websiteName: zx.server.Standalone.getInstance().getWebsiteName()
      };

      let collection = zx.server.Standalone.getInstance().getDb().getCollection("zx.server.work.scheduler.ScheduledTask");
      let json = await collection.findOne(query);
      if (!json) {
        await collection.insertOne({
          _uuid: qx.util.Uuid.createUuidV4(),
          enabled: true,
          cronExpression: "*/20 * * * * *",
          workJson: {
            workClassname: "zx.server.email.FlushQueue"
          },
          title: "Flush Email Queue",
          ...query
        });
      } else {
        await collection.updateOne(query, {
          $set: {
            title: "Flush Email Queue",
            workJson: {
              workClassname: "zx.server.email.FlushQueue"
            }
          }
        });
      }
    }
  }
});
