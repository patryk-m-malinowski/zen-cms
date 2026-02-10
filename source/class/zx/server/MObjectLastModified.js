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

qx.Mixin.define("zx.server.MObjectLastModified", {
  construct() {
    let propertyNames = zx.server.MObjectLastModified.getPropertyNames(this.constructor);
    this.__listeners = propertyNames.forEach(propertyName => {
      this.addListener("change" + qx.lang.String.firstUp(propertyName), this.__onLastModifiedPropertyChange, this);
    });
  },

  properties: {
    /** When an appropriate property has last been modified */
    lastModified: {
      nullable: true,
      check: "Date",
      event: "changeLastModified",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.DEFAULT, zx.utils.anno.Json.PUBLIC, zx.server.anno.LastModified.EXCLUDED]
    }
  },

  members: {
    /** @type{Object[]} array of listener ids for each property */
    __listeners: null,

    /**
     * Event handler for changes to property values that need to be tracked
     *
     * @param {qx.event.type.Data} evt
     */
    __onLastModifiedPropertyChange(evt) {
      // This is provided by zx.io.persistence.MObject
      if (typeof this.isDataLoadComplete == "function" && !this.isDataLoadComplete()) {
        return;
      }

      // This can optionally be provided by the object itself
      if (typeof this.isInRemoteSynchronization == "function" && this.isInRemoteSynchronization()) {
        return;
      }

      let value = evt.getData();
      let oldValue = evt.getOldData();

      if (oldValue instanceof qx.data.Array) {
        oldValue.removeListener("change", this.__onLastModifiedListChange, this);
      }

      if (value instanceof qx.data.Array) {
        value.addListener("change", this.__onLastModifiedListChange, this);
      }

      let propertyName = evt.getType();
      if (qx.core.Environment.get("qx.debug")) {
        this.assertTrue(propertyName.startsWith("change") && qx.lang.String.isUpperCase(propertyName[6]));
      }
      propertyName = qx.lang.String.firstLow(propertyName.substring(6));
      let lastModifiedName = zx.server.MObjectLastModified.getLastModifiedName(this.constructor, propertyName);
      if (lastModifiedName === null) {
        this.setLastModified(new Date());
      } else {
        this["set" + qx.lang.String.firstUp(lastModifiedName)](new Date());
      }
    },

    /**
     * Event handler for changes to arrays which are property values that need to be tracked
     *
     * @param {qx.event.type.Data} evt
     * @returns
     */
    __onLastModifiedListChange(evt) {
      // This is provided by zx.io.persistence.MObject
      if (typeof this.isDataLoadComplete == "function" && !this.isDataLoadComplete()) {
        return;
      }

      // This can optionally be provided by the object itself
      if (typeof this.isInRemoteSynchronization == "function" && this.isInRemoteSynchronization()) {
        return;
      }

      let data = evt.getData();
      if (data.type != "order") {
        this.setLastModified(new Date());
      }
    }
  },

  statics: {
    /** Array of objects, caching data indexed by classname */
    __classes: {},

    /**
     * Returns a list of property names for the specified class that need to have changes tracked in order
     * to update the `lastModified` property
     *
     * @param {qx.Class} clazz
     * @returns {String[]}
     */
    getPropertyNames(clazz) {
      let info = zx.server.MObjectLastModified.__classes[clazz.classname];
      if (info == null) {
        let defaultAnno = null;
        for (let tmp = clazz; tmp && !defaultAnno; tmp = tmp.superclass) {
          let annos = qx.Annotation.getOwnClass(tmp, zx.server.anno.LastModified);
          if (annos.length) {
            defaultAnno = annos[0];
          }
        }
        let defaultIncluded = !!defaultAnno && !defaultAnno.isExcluded();
        let allPropertyNames = defaultAnno ? [] : qx.Class.getProperties(clazz);
        let properties = {};
        allPropertyNames.forEach(propertyName => {
          let annos = qx.Annotation.getProperty(clazz, propertyName, zx.server.anno.LastModified);
          let included = defaultIncluded;
          let name = defaultIncluded ? defaultIncluded.getName() : null;
          if (annos.length) {
            included = !annos[0].isExcluded();
            if (annos[0].getName()) {
              name = annos[0].getName();
            }
          }
          if (included) {
            properties[propertyName] = name;
          }
        });
        info = zx.server.MObjectLastModified.__classes[clazz.classname] = {
          properties
        };
      }

      return Object.keys(info.properties);
    },

    getLastModifiedName(clazz, propertyName) {
      let info = zx.server.MObjectLastModified.__classes[clazz.classname];
      return info.properties[propertyName] || "lastModified";
    }
  }
});
