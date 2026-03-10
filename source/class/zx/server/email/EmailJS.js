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
 * Used for managing the emailJs library
 * https://github.com/eleith/emailjs
 */
qx.Class.define("zx.server.email.EmailJS", {
  statics: {
    /**@type {emailjs} emailjs library*/
    __emailJs: null,
    /**@type {Object} Zen CMS server config*/
    __config: null,

    /**@returns {emailjs} */
    getEmailJs() {
      if (!this.__emailJs) {
        throw new Error("EmailJS not initialized");
      }
      return this.__emailJs;
    },

    /**
     * Initialises the emailJs library so that it can be fetched synchronously using getEmailJs
     */
    async initialise() {
      this.__emailJs = await import("emailjs");
      this.__config = await zx.server.Config.getConfig();
    },

    __ensureNativeArray(value) {
      if (value instanceof qx.data.Array) {
        return value.toArray();
      }
      if (Array.isArray(value)) {
        return value;
      }
      if (value === null || value === undefined) {
        return [];
      }
      return [value];
    },

    _parseHeaders(headers) {
      const isEmailLike = addr => {
        const match = zx.utils.Values.isValidEmail(addr);
        if (!match) {
          qx.log.Logger.warn(`An address was found that does not look like an email address and will be ignored: '${addr}'`);
        }
        return match;
      };

      headers.to = this.__ensureNativeArray(headers.to).filter(isEmailLike);
      headers.cc = this.__ensureNativeArray(headers.cc).filter(isEmailLike);
      headers.bcc = this.__ensureNativeArray(headers.bcc).filter(isEmailLike);

      let config = this.__config;
      if (config.smtpServer.toAddressOverride) {
        let text = "";
        text += "ORIGINAL HEADERS:\n\n";
        text += `\tto: ${headers.to.map(i => `<${i}>`).join(", ")}\n`;
        text += `\tcc: ${headers.cc.map(i => `<${i}>`).join(", ")}\n`;
        text += `\tbcc: ${headers.bcc.map(i => `<${i}>`).join(", ")}\n`;
        headers.text = text + (headers.text ?? "");
        headers.to = config.smtpServer.toAddressOverride;
        headers.cc = [];
        headers.bcc = [];
      } else if (qx.core.Environment.get("qx.debug")) {
        qx.log.Logger.warn(
          "Running in development environment without setting a toAddressOverride - the following email addresses will be sent the email:" +
            `\tto: ${headers.to.map(i => `<${i}>`).join(", ") || "(no to address(es))"}\n` +
            `\tcc: ${headers.cc.map(i => `<${i}>`).join(", ") || "(no cc address(es))"}\n` +
            `\tbcc: ${headers.bcc.map(i => `<${i}>`).join(", ") || "(no bcc address(es))"}\n`
        );
        debugger; //! do not remove - this debugger may prevent accidental sending of emails to real addresses during development
      }

      return headers;
    },

    /**
     * @param {Partial<emailjs.MessageHeaders>} headers
     * @returns {emailjs.Message}
     */
    createNewMessage(headers) {
      headers = this._parseHeaders(headers);

      let Message = this.__emailJs.Message;
      return new Message(headers);
    }
  }
});
