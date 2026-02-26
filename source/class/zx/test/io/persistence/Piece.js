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

qx.Class.define("zx.test.io.persistence.Piece", {
  extend: zx.io.persistence.Object,

  properties: {
    content: {
      init: "",
      check: "String",
      event: "changeContent",
      "@": zx.io.persistence.anno.Property.DEFAULT
    },

    mustNotBeThree: {
      init: 0,
      nullable: false,
      check: "Integer",
      apply: "_applyMustNotBeThree"
    }
  },

  members: {
    _applyMustNotBeThree(value) {
      return new qx.Promise((resolve, reject) => {
        setTimeout(() => {
          if (value == 3) {
            reject("Must Not Be Three!!");
          } else resolve();
        }, 100);
      });
    }
  }
});
