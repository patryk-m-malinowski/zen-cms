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

qx.Class.define("zx.utils.Sha", {
  extend: qx.core.Object,

  statics: {
    sha1(value) {
      let str = require("sha.js").default("sha1").update(value).digest("hex");
      return str;
    },

    sha256(value) {
      let str = require("sha.js").default("sha256").update(value).digest("hex");
      return str;
    }
  }
});
