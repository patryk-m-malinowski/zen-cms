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
 * Helper functions to convert data that has been returned from Mongo into read-only Qooxdoo objects.
 * These objects behave in the exact same way as server objects, but changes to them aren't saved in the database.
 *
 * Useful when we want Qooxdoo objects but don't want to instantiate full server objects
 * because doing that is expensive.
 */
qx.Class.define("zx.utils.Marshal", {
  type: "static",
  statics: {
    /**@type {qx.data.marshal.Json} */
    __marshaller: null,

    /**
     * Converts a POJO or array of POJOs representing server objects to Qooxdoo objects.
     * If an array of POJOs is passed, the result will be a qx.data.Array of Qooxdoo objects.
     *
     * Each object will have a method toUuid().
     *
     * @param {Object | Object[] | qx.data.Array<Object>} obj POJO or array of POJOs
     * @param {boolean} includeClientMixins If true, any mixins that the server object includes will be included in the proxy class. This allows the proxy to be used in more places, but is more expensive to create.
     * @return {qx.core.Object | qx.data.Array<qx.core.Object>} Qooxdoo object or array of Qooxdoo objects
     */
    marshal(obj, includeClientMixins = false) {
      const Marshal = zx.utils.Marshal;
      if (obj instanceof qx.data.Array) {
        return obj.map(item => Marshal.__marshalObject(item, includeClientMixins));
      } else if (Array.isArray(obj)) {
        return new qx.data.Array(obj.map(item => Marshal.__marshalObject(item, includeClientMixins)));
      } else {
        return Marshal.__marshalObject(obj, includeClientMixins);
      }
    },

    /**
     * Converts a single POJO representing a server object to a Qooxdoo object.
     * @param {Object} obj
     * @param {boolean} includeClientMixins
     * @returns {qx.core.Object}
     */
    __marshalObject(obj, includeClientMixins) {
      if (!zx.utils.Marshal.__marshaller) {
        const delegate = {
          getPropertyMapping(property, properties) {
            //Since Qooxdoo 8, it is no longer possible to define properties which collide with members or reserved properties,
            //so we have to rename the _classname property to refClassname.
            if (property === "_classname") {
              return "refClassname";
            }
            return property;
          }
        };
        zx.utils.Marshal.__marshaller = new qx.data.marshal.Json(delegate);
      }

      let marshaller = zx.utils.Marshal.__marshaller;
      marshaller.toClass(obj);

      let proxy = marshaller.toModel(obj, false);

      if (obj._uuid) {
        proxy.setExplicitUuid(obj._uuid);
      } else if (obj.uuid) {
        proxy.setExplicitUuid(obj.uuid);
      }

      if (includeClientMixins) {
        let clazz = qx.Class.getByName(obj.refClassname);
        if (clazz.$$includes) {
          for (let mixin of clazz.$$includes) {
            qx.Class.patch(proxy.constructor, mixin);
          }
        }
      }

      return proxy;
    }
  }
});
