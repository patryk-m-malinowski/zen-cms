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

/**
 * Handles persistence for a specific class derived from qx.core.Object
 *
 * @ignore(Buffer)
 * @ignore(BigNumber)
 * @use(zx.utils.BigNumber)
 */
qx.Class.define("zx.io.persistence.ClassIo", {
  extend: qx.core.Object,
  implement: [zx.io.persistence.IIo],

  /**
   * Constructor
   * @param clazz {qx.Class} the class that this instance will be able to persist
   */
  construct(classIos, clazz) {
    super();
    this.__classIos = classIos;
    this.__clazz = clazz;
    if (!clazz) {
      debugger;
      throw new Error("Must provide a class");
    }

    // Get a list of all properties, all the way up the class heirarchy, and their property
    //  definition; along the way we merge property definitions (which means merging init values
    //  and annotations)
    let properties = {};
    qx.Class.getProperties(clazz).forEach(propertyName => {
      let pdOrig = qx.Class.getPropertyDefinition(clazz, propertyName) ?? {};
      let propertyDef = {
        propertyName
      };

      ["init", "check", "name", "nullable"].forEach(key => {
        if (pdOrig[key] !== undefined) {
          propertyDef[key] = pdOrig[key];
        }
      });
      let annos = pdOrig["@"];
      if (annos) {
        if (!qx.lang.Type.isArray(annos)) {
          annos = [annos];
        } else annos = qx.lang.Array.clone(annos);
      }

      let current = properties[propertyName];
      if (current) {
        if (propertyDef.init !== undefined) {
          current.init = propertyDef.init;
        }
        if (annos) {
          if (!current["@"]) {
            current["@"] = annos;
          } else {
            let arr = [];
            qx.lang.Array.append(arr, annos);
            qx.lang.Array.append(arr, current["@"]);
            current["@"] = arr;
          }
        }
      } else {
        if (propertyDef.check && typeof propertyDef.check == "string") {
          let cls = qx.Class.getByName(propertyDef.check);
          if (cls) {
            propertyDef.check = cls;
          }
        }
        if (annos) {
          propertyDef["@"] = annos;
        }
        properties[propertyName] = propertyDef;
      }
    });

    // Ignore any properties which do not have annotations that we're interested in
    Object.keys(properties).forEach(propertyName => {
      let propertyDef = properties[propertyName];
      let allAnnos = propertyDef["@"] || [];

      let annos = allAnnos.filter(anno => qx.Class.isSubClassOf(anno.constructor, this.__classIos.annoArray));
      let arrayType = null;
      if (annos.length) {
        let anno = annos[annos.length - 1];
        arrayType = propertyDef.arrayType = anno.getArrayType();
      }

      annos = allAnnos.filter(anno => qx.Class.isSubClassOf(anno.constructor, this.__classIos.annoMap));
      let keyType = null;
      if (annos.length) {
        let anno = annos[annos.length - 1];
        arrayType = propertyDef.arrayType = anno.getArrayType();
        keyType = propertyDef.keyType = anno.getKeyType();
      }

      annos = allAnnos.filter(anno => qx.Class.isSubClassOf(anno.constructor, this.__classIos.annoProperty));
      if (!annos.length) {
        delete properties[propertyName];
        return;
      }
      propertyDef["@"] = annos;

      // Embed or just have a reference to?
      for (let i = annos.length - 1; i >= 0; i--) {
        if (annos[i].isEmbed()) {
          propertyDef.embed = true;
          break;
        }
      }

      // Check for explicit IO on the property
      for (let i = annos.length - 1; i >= 0; i--) {
        let refIo = propertyDef.embed ? annos[i].getIo() : annos[i].getRefIo();
        if (refIo != null) {
          propertyDef.refIo = refIo;
          break;
        }
      }

      // What type to look for
      let refType = null;
      if (propertyDef.check) {
        if (propertyDef.check === "Array") {
          refType = arrayType;
        } else if (typeof propertyDef.check != "string") {
          if (qx.Class.isSubClassOf(propertyDef.check, qx.data.Array)) {
            refType = arrayType;
          } else if (qx.Class.isSubClassOf(propertyDef.check, zx.data.Map)) {
            refType = arrayType;
          } else if (qx.Class.isSubClassOf(propertyDef.check, qx.core.Object)) {
            refType = propertyDef.check;
          }
        }
      }
      propertyDef.refType = refType;

      // See if we can guess
      if (refType) {
        // Get the default, registered implementation
        let refIo = propertyDef.embed ? this.__classIos.getClassIo(refType) : this.__classIos.getDefaultRefIo(refType);
        if (refIo) {
          propertyDef.defaultRefIo = refIo;
        }
      }
    });

    this.__properties = properties;

    zx.io.remote.NetworkEndpoint.initialiseRemoteClass(clazz);
  },

  members: {
    /** @type{qx.Class} The class */
    __clazz: null,

    /** @type{zx.io.persistence.ClassIos} ClassIos instance we're attached to */
    __classIos: null,

    /**
     * @typedef PropertyDef {Object}
     * @property {var} init
     * @property {Class|String?} check the check
     * @property {qx.Annotation[]?} "@" Annotations
     * @property {qx.Class?} arrayType the type of arrays (or values in case of `zx.data.Map` properties)
     * @property {qx.Class?} keyType type of keys (only applies to `zx.data.Map` properties)
     * @property {qx.Class?} refType the type of refIo to look for
     * @property {zx.io.persistence.ClassRefIo} refIo
     */

    /** @type {Map<String,PropertyDef} A map of property definitions, indexed by property name */
    __properties: null,

    /**
     * Reads JSON data and populates an object, creating it if required
     *
     * @param endpoint {zx.io.persistence.Endpoint} the endpoint
     * @param json {Object} the JSON data to load
     * @param obj {qx.core.Object?} the object to populate, created if not provided
     * @return {qx.core.Object} the populated object
     */
    async fromJson(endpoint, json, obj) {
      let ctlr = endpoint.getController();
      let clazz = this.__clazz;
      if (json._classname) {
        let cls = qx.Class.getByName(json._classname);
        if (!cls) {
          throw new Error(`Cannot create instance of class ${json._classname} because the class does not exist`);
        }
        if (!qx.Class.isSubClassOf(cls, this.__clazz)) {
          throw new Error(`Cannot load instance of class ${json._classname} because the class is not compatible with this class IO ${this.__clazz.classname}`);
        }

        clazz = cls;
      }
      if (!obj) {
        obj = ctlr.createObject(clazz, json._uuid);
      }

      let promises = [];
      for (let propertyName in this.__properties) {
        if (json[propertyName] === undefined) {
          continue;
        }

        let propertyDef = this.__properties[propertyName];
        let propertyPath = clazz.classname + "." + propertyName;
        let annos = propertyDef["@"];
        let check = propertyDef.check;

        let value = this.fromJsonValue(endpoint, json[propertyName], propertyDef, propertyPath);
        let promise = zx.utils.Promisify.resolveNow(value, value => {
          this._setPropertyValueImpl(endpoint, obj, propertyName, value, propertyDef, propertyPath);
        });
        if (promise) {
          promises.push(promise);
        }
      }

      return zx.utils.Promisify.allNow(
        promises,
        () => {
          return zx.utils.Promisify.resolveNow(ctlr.setObjectComplete(obj));
        },
        err => {
          return zx.utils.Promisify.resolveNow(ctlr.setObjectComplete(obj, err));
        }
      );
    },

    /**
     * Helper method to determine the `zx.io.persistence.ClassRefIo` to use for a
     * property; uses fallbacks to always return a value.
     *
     * @param {*} propertyDef
     * @param {Class} clazz
     * @returns {zx.io.persistence.ClassRefIo}
     */
    __getRefIo(propertyDef, clazz) {
      if (propertyDef) {
        if (propertyDef.refIo) {
          return propertyDef.refIo;
        }
        if (propertyDef.embed) {
          return this.__classIos.getClassIo(clazz);
        }
      }
      return this.__classIos.getDefaultRefIo(clazz);
    },

    /**
     * Part of the internal implementation of `fromJson`; this will query the database if
     * `value.$query` is set, and will convert the JSON into an actual object.
     *
     * @param {zx.io.persistence.Endpoint} endpoint
     * @param {*} propertyDef
     * @param {*} value the JSON to convert
     * @param {Class} defaultType the class to use if the JSON does not specify a classname
     * @returns {zx.io.persistence.IObject}
     */
    __convertObjectFromJson(endpoint, propertyDef, value, defaultType) {
      if (value === null) {
        return null;
      }

      if (value.$query) {
        let query = qx.lang.Object.clone(value.$query);
        return endpoint
          .findOne(qx.Class.getByName(value._classname), query, { _uuid: 1, _classname: 1 })
          .then(newJson => (newJson ? this.__convertObjectFromJson(endpoint, propertyDef, newJson, defaultType) : null));
      }

      let valueType = null;
      if (typeof value._classname == "string") {
        valueType = qx.Class.getByName(value._classname);
        if (!valueType) {
          this.error(`Unable to convert IObject in __convertObjectFromJson because cannot find class ${value._classname}`);
        }
      }

      if (!valueType && defaultType) {
        valueType = defaultType;
      }
      if (valueType) {
        let refIo = this.__getRefIo(propertyDef, valueType);
        if (refIo) {
          let obj = zx.utils.Promisify.resolveNow(refIo.fromJson(endpoint, value));
          value = obj;
        }
      }

      return value;
    },

    /**
     * Part of the internal implementation of `fromJson`; this will iterate the array and
     * load each entry; if the array is not an array, it will be converted into an array.
     *
     * @param {zx.io.persistence.Endpoint} endpoint
     * @param {*} propertyDef
     * @param {Object[]|Object} arr the array of JSON objects to convert
     * @returns {zx.io.persistence.IObject[]}
     */
    __convertArrayFromJson(endpoint, propertyDef, arr) {
      if (!qx.lang.Type.isArray(arr)) {
        arr = [arr];
      } else arr = qx.lang.Array.clone(arr);
      for (let i = 0; i < arr.length; i++) {
        if (arr[i]) {
          arr[i] = this.__convertObjectFromJson(endpoint, propertyDef, arr[i], propertyDef.arrayType);
        }
      }

      return zx.utils.Promisify.allNow(arr);
    },

    /**
     * Part of the internal implementation of `fromJson`; this will iterate the map and
     * load each entry
     *
     * @param {zx.io.persistence.Endpoint} endpoint
     * @param {*} propertyDef
     * @param {Object} map the map (key/value pairs) where the values are to be converted
     * @returns {zx.io.persistence.IObject[]}
     */
    __convertMapFromJson(endpoint, propertyDef, map) {
      map = qx.lang.Object.clone(map);
      let promises = [];
      Object.keys(map).forEach(key => {
        key = this.__convertObjectFromJson(endpoint, propertyDef, key, propertyDef.keyType);
        let promise = zx.utils.Promisify.resolveNow(key, key => {
          let value = this.__convertObjectFromJson(endpoint, propertyDef, map[key], propertyDef.arrayType);
          return zx.utils.Promisify.resolveNow(value, value => {
            map[key] = value;
          });
        });
        promises.push(promise);
      });

      return zx.utils.Promisify.allNow(promises, () => map);
    },

    /**
     * Serialises a single property value from JSON
     *
     * @param endpoint {zx.io.persistence.Endpoint} the endpoint
     * @param value {Object?} the value to deserialize
     * @param propertyDef {Map?} normalized map of property definition
     * @param propertyMap {String?} property path for debug output
     * @return {Object?} the deserialised version
     *
     * @async Note that this may return a promise
     */
    fromJsonValue(endpoint, value, propertyDef, propertyPath) {
      let ctlr = endpoint.getController();

      if (propertyPath.match(/requiredPermissions$/)) {
        console.log("fromJsonValue: " + propertyPath);
      }

      const getRefIo = clazz => {
        if (propertyDef) {
          if (propertyDef.refIo) {
            return propertyDef.refIo;
          }
          if (propertyDef.embed) {
            return this.__classIos.getClassIo(clazz);
          }
        }
        return this.__classIos.getDefaultRefIo(clazz);
      };

      if (value === null || value === undefined) {
        return value;
      }

      let check = propertyDef.check;
      if (value._classname) {
        let cls = qx.Class.getByName(value._classname);
        if (!cls) {
          throw new Error(`Cannot create instance of class ${value._classname} because the class does not exist, property=${propertyPath}, class=${check.classname}`);
        }

        if (check && !qx.Class.isSubClassOf(cls, check)) {
          throw new Error(`Cannot load instance of class ${value._classname} because the class is not compatible with the property check ${check}, property=${propertyPath}, class=${check.classname}`);
        }

        check = cls;
      }

      value = endpoint.decodeValue(value);

      // If the check is a class which exists, then check will be that class
      if (check && typeof check != "string") {
        if (qx.Class.isSubClassOf(check, qx.data.Array)) {
          value = zx.utils.Promisify.resolveNow(this.__convertArrayFromJson(endpoint, propertyDef, value), arr => new check(arr));
        } else if (qx.Class.isSubClassOf(check, zx.data.Map)) {
          value = zx.utils.Promisify.resolveNow(this.__convertMapFromJson(endpoint, propertyDef, value), map => new check(map));
        } else if (qx.Class.isSubClassOf(check, qx.core.Object)) {
          let refIo = getRefIo(check);
          if (refIo) {
            value = zx.utils.Promisify.resolveNow(refIo.fromJson(endpoint, value));
          } else {
            this.warn(`Missing ClassRefIo required to deserialized object: property=${propertyPath}, class=${check.classname}, value=${JSON.stringify(value)}`);

            value = null;
          }
        }
      } else if (check === "Array") {
        value = this.__convertArrayFromJson(endpoint, propertyDef, value);
      } else if (check === "Integer") {
        value = parseInt(value, 10);
        if (isNaN(value)) {
          this.warn(`Cannot parse integer: property=${propertyPath}, value=${JSON.stringify(value)}`);
          value = null;
        }
      } else if (check === "Number") {
        value = parseFloat(value);
        if (isNaN(value)) {
          this.warn(`Cannot parse float: property=${propertyPath}, value=${JSON.stringify(value)}`);
          value = null;
        }
      } else if (check === "Boolean") {
        value = !!value;
      } else if (check && qx.lang.Type.isArray(check)) {
        if (!qx.lang.Array.contains(check, value)) {
          this.warn(`Cannot apply invalid value: property=${propertyPath}, value=${JSON.stringify(value)}`);
          value = null;
        }
      } else if (typeof check == "string") {
        if (check.indexOf(".") > 0) {
          this.warn(`Unrecognised "check" constraint for property ${propertyPath}: ${check} - could be a missing class`);
        }
      }

      return value;
    },

    /**
     * Serializes the object into JSON
     *
     * @param endpoints {zx.io.persistence.Endpoint[]} the endpoints
     * @param obj {qx.core.Object} the object to serialize
     * @param json {Object?} the JSON to update, created if not provided
     * @return {Object} serialized JSON object
     */
    async toJson(endpoints, obj, json) {
      if (!json) {
        json = {};
      }
      json._classname = obj.classname;
      json._uuid = obj.toUuid();

      if (qx.Class.hasInterface(obj.constructor, zx.io.persistence.IObjectNotifications)) {
        await obj.receiveDataNotification(zx.io.persistence.IObjectNotifications.BEFORE_WRITE_TO_JSON);
      }

      for (let propertyName in this.__properties) {
        let propertyDef = this.__properties[propertyName];
        let propertyPath = this.__clazz.classname + "." + propertyName;
        let annos = propertyDef["@"];
        let check = propertyDef.check;

        let value = obj["get" + qx.lang.String.firstUp(propertyName)]();
        let jsonValue = await this.toJsonValue(endpoints, value, propertyDef, propertyPath);
        json[propertyName] = jsonValue;
      }

      if (qx.Class.hasInterface(obj.constructor, zx.io.persistence.IObjectNotifications)) {
        await obj.receiveDataNotification(zx.io.persistence.IObjectNotifications.WRITE_TO_JSON_COMPLETE, json);
      }

      return json;
    },

    /**
     * Serialises a single property value into JSON
     *
     * @param endpoints {zx.io.persistence.Endpoint[]} the endpoints to write to
     * @param value {Object?} the value to serialize
     * @param propertyDef {Map?} normalized map of property definition
     * @param propertyMap {String?} property path for debug output
     * @return {Object?} the serialised version
     *
     * @async Note may return a promise
     */
    toJsonValue(endpoints, value, propertyDef, propertyPath) {
      if (!propertyPath) {
        propertyPath = "(unspecified)";
      }

      const getRefIo = clazz => {
        if (propertyDef) {
          if (propertyDef.refIo) {
            return propertyDef.refIo;
          }
          if (propertyDef.embed) {
            return this.__classIos.getClassIo(clazz);
          }
        }
        return this.__classIos.getDefaultRefIo(clazz);
      };

      function convertArray(arr, fn) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] !== null) {
            let refIo = getRefIo(arr[i].constructor);
            if (refIo) {
              arr[i] = refIo.toJson(endpoints, arr[i]);
            }
          }
        }
        return zx.utils.Promisify.allNow(arr, fn);
      }

      function convertMap(map, fn) {
        Object.keys(map).forEach(key => {
          let value = map[key];
          if (value !== null) {
            let refIo = getRefIo(value.constructor);
            if (refIo) {
              map[key] = refIo.toJson(endpoints, value);
            }
          }
        });
        return zx.utils.Promisify.allMapValuesNow(map, fn);
      }

      if (value instanceof qx.data.Array) {
        value = qx.lang.Array.clone(value.toArray());
        return convertArray(value, newValue => (value = newValue));
      }

      if (qx.lang.Type.isArray(value)) {
        value = qx.lang.Array.clone(value);
        return convertArray(value, newValue => (value = newValue));
      }

      if (value instanceof zx.data.Map) {
        value = qx.lang.Object.clone(value.toObject());
        return convertMap(value, newValue => (value = newValue));
      }

      if (this.__classIos.isCompatibleObject(value)) {
        let refIo = getRefIo(value.constructor);
        value = refIo.toJson(endpoints, value);
        return value;
      }

      if (value instanceof Date || value instanceof BigNumber) {
        if (!endpoints.length) {
          this.warn(`Cannot serialize date or BigNumber without an endpoint: property=${propertyPath}, value=${value}`);
          return value;
        }
        return endpoints[0].encodeValue(value);
      }

      if (value instanceof qx.core.Object) {
        let refIo = propertyDef && (propertyDef.refIo || propertyDef.defaultRefIo);
        if (refIo) {
          value = zx.utils.Promisify.resolveNow(refIo.toJson(endpoints, value), tmp => {
            if (tmp === null || tmp === undefined) {
              this.warn(`Failed to serialize object: property=${propertyPath}, class=${value.classname}, value=${value}`);

              return null;
            } else {
              return tmp;
            }
          });
        } else {
          this.warn(`Missing ClassRefIo required to serialized object: property=${propertyPath}, class=${value.classname}, value=${value}`);

          value = null;
        }
      }

      return value;
    },

    /**
     * Called by an endpoint to watch an object for changes.  When the callback is called,
     * the data which is passed to it ha already been converted into JSON.
     *
     * @param {zx.io.persistence.Endpoint} endpoint
     * @param {zx.io.persistene.IObject} obj
     * @param {WatchForChangesCallback} callback
     * @returns
     *
     * @typedef WatchForChangesChangeType {"setValue" | "arrayReplace" | "arrayChange" | "mapReplace" | "mapChange"}
     *
     * @callback WatchForChangesCallback
     * @param {zx.io.persistence.IObject} obj the object that had a property which changed
     * @param {String} propertyName the name of the properyt
     * @param {WatchForChangesChangeType} changeType
     * @param {var} value the new value for the property
     */
    watchForChanges(endpoint, obj, callback) {
      let state = {
        obj,
        properties: {},
        callback
      };

      Object.keys(this.__properties).forEach(propertyName => {
        let upname = qx.lang.String.firstUp(propertyName);
        let propertyDef = this.__properties[propertyName];
        let propertyPath = this.__clazz.classname + "." + propertyName;
        let annos = propertyDef["@"];
        let check = propertyDef.check;
        let propState = (state.properties[propertyName] = {});

        const toJsonNow = (value, fn) => {
          return zx.utils.Promisify.resolveNow(value, value => {
            return zx.utils.Promisify.resolveNow(this.toJsonValue(endpoint, value, propertyDef, propertyPath), fn);
          });
        };

        if (qx.Class.isSubClassOf(propertyDef.check, qx.data.Array)) {
          // The issue is that if you are adding promises to an array that we synchronise, we have to resolve that promise
          //  first in order to see the value that needs to be serialised.  This suggests that you may not be taking care
          //  of recursive modifications (eg you could allow the user to make another change while this change is waiting
          //  to be implemented in the server round trip) and anyway, you probably want an array of objects not promises!
          const allToJsonValueNow = (arr, fn) => {
            if (!arr || !arr.length) {
              return fn([]);
            }

            if (qx.core.Environment.get("qx.debug") && arr.find(item => qx.Promise.isPromise(item))) {
              this.warn("Adding/removing promises to an array may not be what you intended - make sure to handle recursion");
            }

            return zx.utils.Promisify.allNow(arr, arr => {
              arr = arr.map(item => this.toJsonValue(endpoint, item, propertyDef, propertyPath));
              return zx.utils.Promisify.allNow(arr, fn);
            });
          };

          const onArrayChange = evt => {
            let data = evt.getData();
            if (data.type == "order") {
              let value = this.toJsonValue(endpoint, evt.getTarget(), propertyDef, propertyPath);
              return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "arrayReplace", value));
            } else {
              return allToJsonValueNow(data.removed, removed => {
                return allToJsonValueNow(data.added, added => {
                  let data = {};
                  if (removed.length) {
                    data.removed = removed;
                  }
                  if (added.length) {
                    data.added = added;
                  }
                  callback(obj, propertyName, "arrayChange", data);
                });
              });
            }
          };

          const onValueChange = evt => {
            let data = evt.getData();
            let oldData = evt.getOldData();
            if (propState.arrayChangeListenerId) {
              oldData.removeListenerById(propState.arrayChangeListenerId);
              propState.arrayChangeListenerId = null;
            }
            let value = this.toJsonValue(endpoint, data, propertyDef, propertyPath);
            if (data) {
              propState.arrayChangeListenerId = data.addListener("change", onArrayChange);
              return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "arrayReplace", value));
            } else {
              return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "setValue", value));
            }
          };

          propState.changeListenerId = obj.addListener("change" + upname, onValueChange);
          let array = obj["get" + upname]();
          if (array) {
            propState.arrayChangeListenerId = array.addListener("change", onArrayChange);
          }

          // Maps
        } else if (qx.Class.isSubClassOf(propertyDef.check, zx.data.Map)) {
          // The issue is that if you are adding promises to an array that we synchronise, we have to resolve that promise
          //  first in order to see the value that needs to be serialised.  This suggests that you may not be taking care
          //  of recursive modifications (eg you could allow the user to make another change while this change is waiting
          //  to be implemented in the server round trip) and anyway, you probably want an array of objects not promises!
          const resolveChangedDataNow = (arr, fn) => {
            if (arr === undefined || arr === null) {
              return fn(arr);
            }
            let promises = arr.map(data => {
              if (qx.core.Environment.get("qx.debug") && (qx.Promise.isPromise(data.value) || qx.Promise.isPromise(data.oldValue))) {
                this.warn("Adding/removing promises to a zx.data.Map may not be what you intended - make sure to handle recursion");
              }
              return toJsonNow(data.key, key => {
                return toJsonNow(data.value, value => {
                  return { key, value };
                });
              });
            });
            return zx.utils.Promisify.allNow(promises, fn);
          };

          const onMapContentsChange = evt => {
            let data = evt.getData();
            if (data.type == "order") {
              let value = this.toJsonValue(endpoint, evt.getTarget(), propertyDef, propertyPath);
              return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "mapReplace", value));
            } else {
              return resolveChangedDataNow(data.removed, removed => {
                return resolveChangedDataNow(data.put, put => {
                  let data = {};
                  if (removed && removed.length) {
                    data.removed = removed;
                  }
                  if (put && put.length) {
                    data.put = put;
                  }
                  callback(obj, propertyName, "mapChange", data);
                });
              });
            }
          };

          const onValueChange = evt => {
            let data = evt.getData();
            let oldData = evt.getOldData();
            if (propState.arrayChangeListenerId) {
              oldData.removeListenerById(propState.arrayChangeListenerId);
              propState.arrayChangeListenerId = null;
            }
            let value = this.toJsonValue(endpoint, data, propertyDef, propertyPath);
            if (data) {
              propState.arrayChangeListenerId = data.addListener("change", onMapContentsChange);
              return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "mapReplace", value));
            } else {
              return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "setValue", value));
            }
          };

          propState.changeListenerId = obj.addListener("change" + upname, onValueChange);
          let array = obj["get" + upname]();
          if (array) {
            propState.arrayChangeListenerId = array.addListener("change", onMapContentsChange);
          }

          // Normal values
        } else {
          propState.changeListenerId = obj.addListener("change" + upname, evt => {
            let value = this.toJsonValue(endpoint, evt.getData(), propertyDef, propertyPath);
            return zx.utils.Promisify.resolveNow(value, value => callback(obj, propertyName, "setValue", value));
          });
        }
      });

      return state;
    },

    /**
     * Inverse of `watchForChanges`
     *
     * @param {zx.io.persistence.Endpoint} endpoint
     * @param {*} state
     */
    unwatchForChanges(endpoint, state) {
      Object.keys(state.properties).forEach(propertyName => {
        let propState = state.properties[propertyName];
        state.obj.removeListenerById(propState.changeListenerId);
        if (propState.arrayChangeListenerId) {
          let upname = qx.lang.String.firstUp(propertyName);
          let array = state.obj["get" + upname]();
          array.removeListenerById(propState.arrayChangeListenerId);
        }
      });
      delete state.properties;
    },

    /**
     * Called when the store needs to record a property value change.  This needs to store raw POJO
     * values which can be natively serialised just by calling `JSON.serialize`, IE do not store actual
     * `qx.core.Object` objects.
     *
     * This method is called indirectly from `watchForChanges` and the `value` passed in here comes
     * from that method.
     *
     * @param {Object} store
     * @param {String} propertyName the name of the property that changed
     * @param {WatchForChangesChangeType} changeType the type of change, eg "setValue", "arrayChange", etc
     * @param {Object} value native JSON representation of the property
     */
    storeChange(store, propertyName, changeType, value) {
      // Arrays - the value mirrors the data from the event, so will have `added` and `removed` properties
      if (changeType == "arrayChange") {
        if (store.arrayChange === undefined) {
          store.arrayChange = {};
        }
        if (store.arrayChange[propertyName] === undefined) {
          store.arrayChange[propertyName] = [];
        }
        store.arrayChange[propertyName].push({ added: value.added, removed: value.removed });

        if (store.setValue !== undefined) {
          delete store.setValue[propertyName];
        }

        // Maps - the value mirrors the data from the event so will have `put` and `removed` properties
      } else if (changeType == "mapChange") {
        if (store.mapChange === undefined) {
          store.mapChange = {};
        }
        if (store.mapChange[propertyName] === undefined) {
          store.mapChange[propertyName] = [];
        }
        store.mapChange[propertyName].push({ put: value.put, removed: value.removed });
        if (store.setValue !== undefined) {
          delete store.setValue[propertyName];
        }

        // Ordinary values
      } else {
        if (store.setValue === undefined) {
          store.setValue = {};
        }
        store.setValue[propertyName] = value;
        if (store.arrayChange !== undefined) {
          delete store.arrayChange[propertyName];
        }
        if (store.mapChange !== undefined) {
          delete store.mapChange[propertyName];
        }
      }
    },

    /**
     * Replays a set of recorded changes on a known object, used for when a change set
     * is received over the network
     *
     * @param endpoint {Endpoint} the endpoint that is providing the changes (used to suppress recursive notifications)
     * @param store {Map} map of changes
     * @return {Promise?} may return a promise if the change was asynchronous
     */
    restoreChanges(endpoint, store, obj) {
      let results = [];
      if (store.setValue) {
        let p = zx.utils.Promisify.mapEachNow(Object.keys(store.setValue), key => this.__setPropertyValueFromRemote(endpoint, obj, key, "setValue", store.setValue[key]));

        results.push(p);
      }
      if (store.arrayChange) {
        let p = zx.utils.Promisify.mapEachNow(Object.keys(store.arrayChange), key => this.__setPropertyValueFromRemote(endpoint, obj, key, "arrayChange", store.arrayChange[key]));

        results.push(p);
      }
      if (store.mapChange) {
        let p = zx.utils.Promisify.mapEachNow(Object.keys(store.mapChange), key => this.__setPropertyValueFromRemote(endpoint, obj, key, "mapChange", store.mapChange[key]));

        results.push(p);
      }

      return zx.utils.Promisify.allNow(results);
    },

    /**
     * Sets a property value as received from the network
     *
     * @param {*zx.io.remote.NetworkEndpoint} endpoint
     * @param {qx.core.Object} obj
     * @param {String} propertyName name of the property
     * @param {String} changeType type of change, currently `arrayChange`, `arrayReplace`, or `setValue`
     * @param {*} value
     * @returns
     */
    __setPropertyValueFromRemote(endpoint, obj, propertyName, changeType, value) {
      let propertyDef = this.__properties[propertyName];
      let propertyPath = this.__clazz.classname + "." + propertyName;

      const doIt = () => {
        if (changeType == "arrayChange") {
          if (!qx.lang.Type.isArray(value)) {
            value = [value];
          }
          let promises = value.map(value => {
            let removed = this.fromJsonValue(endpoint, value.removed, propertyDef, propertyPath) || [];
            let added = this.fromJsonValue(endpoint, value.added, propertyDef, propertyPath) || [];

            return zx.utils.Promisify.resolveNow(removed, removed => {
              return zx.utils.Promisify.resolveNow(added, added => {
                let array = obj["get" + qx.lang.String.firstUp(propertyName)]();
                removed.forEach(item => array.remove(item));
                added.forEach(item => array.push(item));
              });
            });
          });
          return zx.utils.Promisify.allNow(promises);
        } else if (changeType == "mapChange") {
          /*
           * mapChange means that `value` is an array of change data, each of which has `put` and `removed`; the
           * `put` and `removed` are also arrays of objects, each of which has `value` and `key`
           */
          if (!qx.lang.Type.isArray(value)) {
            value = [value];
          }
          const getValue = (value, type, fn) => {
            let newValue = this.__convertObjectFromJson(endpoint, propertyDef, value, type);
            return zx.utils.Promisify.resolveNow(newValue, fn);
          };
          let map = obj["get" + qx.lang.String.firstUp(propertyName)]();
          let promise = zx.utils.Promisify.forEachNow(value, entry => {
            let promise = zx.utils.Promisify.forEachNow(entry.removed || [], change => {
              return getValue(change.key, propertyDef.keyType, key => map.remove(key));
            });
            return zx.utils.Promisify.resolveNow(promise, () => {
              return zx.utils.Promisify.forEachNow(entry.put || [], change => {
                return getValue(change.key, propertyDef.keyType, key => {
                  return getValue(change.value, propertyDef.arrayType, value => {
                    map.put(key, value);
                  });
                });
              });
            });
          });
          return zx.utils.Promisify.resolveNow(promise);
        } else if (changeType == "setValue" || changeType == "arrayReplace") {
          value = this.fromJsonValue(endpoint, value, propertyDef, propertyPath);
          return zx.utils.Promisify.resolveNow(value, value => {
            return this._setPropertyValueImpl(endpoint, obj, propertyName, value, propertyDef, propertyPath);
          });
        } else {
          throw new Error(`Unexpected type of change ${changeType} for ${obj} (${obj.classname})`);
        }
      };

      let result;
      try {
        endpoint.beginChangingProperty(obj, propertyName);
        result = doIt();
      } catch (ex) {
        endpoint.endChangingProperty(obj, propertyName);
        throw ex;
      }
      if (qx.Promise.isPromise(result)) {
        result = result.finally(() => endpoint.endChangingProperty(obj, propertyName));
      } else endpoint.endChangingProperty(obj, propertyName);

      return result;
    },

    /**
     * Implements setting a property value; this is used from `fromJson` (so for database and network) as
     * well as `__setPropertyValueFromRemote` (which is network only)
     *
     * @param {zx.io.persistence.Endpoint} endpoint the endpoint
     * @param {qx.core.Object} obj
     * @param {String} propertyName
     * @param {*} value
     * @param {Object} propertyDef
     * @param {String} propertyPath
     * @returns
     */
    _setPropertyValueImpl(endpoint, obj, propertyName, value, propertyDef, propertyPath) {
      if (propertyDef.nullable !== true && value === null) {
        this.warn(`Cannot apply null value: property=${propertyPath}`);
        return null;
      }

      if (qx.Promise.isPromise(value)) {
        value = qx.Promise.resolve(value);
      }

      try {
        endpoint.beginChangingProperty(obj, propertyName);
        let setName = "set" + qx.lang.String.firstUp(propertyName);
        return zx.utils.Promisify.resolveNow(value, value => obj[setName](value));
      } finally {
        endpoint.endChangingProperty(obj, propertyName);
      }
    },

    /**
     * Returns the target class that this is for; note that `object.constructor` may differ
     * because this could be handling for derived classes
     *
     * @returns {qx.Class}
     */
    getClass() {
      return this.__clazz;
    },

    /**
     * Returns the properties
     *
     * @return {Map<String,PropertyDef>} A map of property definitions, indexed by property name
     */
    getProperties() {
      return this.__properties;
    }
  },

  statics: {}
});
