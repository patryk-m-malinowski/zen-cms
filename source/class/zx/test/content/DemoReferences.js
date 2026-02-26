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

qx.Class.define("zx.test.content.DemoReferences", {
  extend: zx.io.persistence.Object,

  properties: {
    title: {
      nullable: false,
      check: "String",
      event: "changeTitle",
      "@": zx.io.persistence.anno.Property.DEFAULT
    },

    other: {
      init: null,
      nullable: true,
      event: "changeOther",
      check: "zx.test.content.DemoReferences",
      "@": zx.io.persistence.anno.Property.DEFAULT
    }
  }
});
