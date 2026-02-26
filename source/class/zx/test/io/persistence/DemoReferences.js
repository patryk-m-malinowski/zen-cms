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

qx.Class.define("zx.test.io.persistence.DemoReferences", {
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
      check: "zx.test.io.persistence.DemoReferences",
      "@": zx.io.persistence.anno.Property.DEFAULT
    },

    myArray: {
      init: null,
      nullable: true,
      check: "qx.data.Array",
      event: "changeMyArray",
      "@": zx.io.persistence.anno.Property.EMBED
    },

    myMap: {
      init: null,
      nullable: true,
      check: "zx.data.Map",
      event: "changeMyMap",
      "@": zx.io.persistence.anno.Property.DEFAULT
    }
  }
});
