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
 * Used to render HTML emails in the browser and then send them
 */
qx.Class.define("zx.server.email.EmailRenderer", {
  statics: {
    /**
     * @param {zx.server.work.Worker} worker
     * @param {string} url  URL of the webpage with the email content
     * @param {Object} clientProperties Configuration for the instance of `zx.server.puppeteer.PuppeteerClient`
     * @returns {Promise<zx.server.email.Message[]>} Array of messages to send
     */
    async run(worker, url, clientProperties) {
      let messages = [];

      await zx.server.puppeteer.CapturePage.execute(worker, {
        url,
        clientProperties,
        async onPageReady({ data, ctlr }) {
          let {
            htmlBody,
            textBody,
            /**@type {EmailParameters}*/
            parameters
          } = data;

          const collapseAddresses = value => {
            if (qx.lang.Type.isArray(value)) {
              return value;
            }
            return value?.split(",") ?? [];
          };
          parameters.to = collapseAddresses(parameters.to);
          parameters.cc = collapseAddresses(parameters.cc);
          parameters.bcc = collapseAddresses(parameters.bcc);
          worker.appendWorkLog("Email body to send: " + htmlBody);
          worker.appendWorkLog("Email parameters: " + JSON.stringify(parameters, null, 2));

          if (parameters.attachments) {
            const attachments = new qx.data.Array();
            for (let attachment of parameters.attachments) {
              if (attachment instanceof zx.server.email.Attachment) {
                attachments.push(attachment);
                continue;
              }
              attachments.push(
                new zx.server.email.Attachment().set({
                  name: attachment.name,
                  path: attachment.path
                })
              );
            }
            parameters.attachments = attachments;
          }

          // ensure all `undefined` values are replaced with `null`
          for (const key in parameters) {
            parameters[key] ??= null;
          }

          worker.appendWorkLog("Composing email...");
          let message = new zx.server.email.Message().set({ ...parameters, htmlBody, textBody });
          await message.save();
          worker.appendWorkLog("Email composed");
          messages.push(message);
        }
      });
      return messages;
    }
  }
});
