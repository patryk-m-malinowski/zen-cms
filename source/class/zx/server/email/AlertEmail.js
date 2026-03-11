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

const os = require("os");

/**
 * This class is used to send alerts via email to the server administrator.
 * It is useful for things like alerting the admin of any errors in the server that need attention.
 *
 * It debounces the emails such that an alert email is only sent every 5 minutes or less,
 * hence an email may have more than one alert.
 */
qx.Class.define("zx.server.email.AlertEmail", {
  type: "singleton",
  extend: qx.core.Object,
  construct() {
    super();
    const MINUTE = 60 * 1000;
    const INTERVAL_MS = this.constructor.INTERVAL_MINUTES * MINUTE;
    // const INTERVAL_MS = 2000;//for testing
    this.__debounce = new qx.util.Debounce(this.__sendEmail.bind(this), INTERVAL_MS).set({ onPending: "ignore" });
  },
  members: {
    /**
     * @type {qx.util.Debounce}
     */
    __debounce: null,
    /**
     * @type {string}
     * The body of the email, accumulating the alerts util the email is sent
     */
    __body: "",

    /**
     * Adds an alert to send to the alerts email
     * @param {string} title Title of the alert
     * @param {string} text Full text or message of the alert
     */
    alert(title, text) {
      const config = zx.server.Config.getInstance().getConfigData();
      if (!config.alertsEmail) {
        console.warn("Alerts email not set, cannot send alert email with title: " + title);
        return;
      }

      let message = [
        `================== Alert at ${new Date().toISOString()} ==================`,
        `================== Title: ${title ?? "No title"} ==================`,
        text, //
        "\n"
      ].join("\n");

      this.__body += message;

      this.__debounce.trigger();
    },

    /**
     * Sends the emails with alerts
     */
    async __sendEmail() {
      let client = zx.server.email.SMTPClient.getSmtpClientImpl();
      const config = zx.server.Config.getInstance().getConfigData();
      let message = zx.server.email.EmailJS.createNewMessage({
        from: config.smtpServer.fromAddr,
        to: config.alertsEmail,
        subject: `ZX Server alert for ${config.websiteName}, machine: ${os.hostname()}`,
        text: this.__body
      });

      try {
        await client.sendAsync(message);
      } catch (err) {
        this.error("Error sending alert email: " + err.message + "\n" + err.stack);
      }

      this.__body = "";
    },

    /**
     *
     * @returns {Promise<void>} A promise which resolves when all the queued alerts have been sent
     */
    async join() {
      return this.__debounce.join();
    }
  },

  statics: {
    /**
     * Every how many minutes minimum to send an alert email
     */
    INTERVAL_MINUTES: 1
  }
});
