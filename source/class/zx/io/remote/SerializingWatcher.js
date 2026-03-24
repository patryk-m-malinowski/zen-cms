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

qx.Class.define("zx.io.remote.SerializingWatcher", {
  extend: zx.io.persistence.Watcher,

  members: {
    /**
     * @override
     */
    _attachObject(info, endpoint) {
      if (!info.endpoints) {
        info.endpoints = [];
      }
      if (qx.core.Environment.get("qx.debug")) {
        this.assertTrue(!qx.lang.Array.contains(info.endpoints, endpoint));
      }
      info.endpoints.push(endpoint);
    },

    /**
     * @override
     */
    _detachObject(info, endpoint) {
      if (qx.core.Environment.get("qx.debug")) {
        this.assertTrue(qx.lang.Array.contains(info.endpoints, endpoint));
      }
      qx.lang.Array.remove(info.endpoints, endpoint);
      return info.endpoints.length == 0;
    },

    /**
     * @override
     */
    _isWatchingImpl(info, endpoint) {
      return qx.lang.Array.contains(info.endpoints, endpoint);
    },

    /**
     * @override
     */
    _watchProperty(info, propertyName) {
      let object = info.object;
      let upname = qx.lang.String.firstUp(propertyName);
      let io = this.getClassIos().getClassIo(object.constructor);
      let properties = io.getProperties();
      let propertyDef = properties[propertyName];
      let propertyPath = io.getClass().classname + "." + propertyName;
      let propState = (info.properties[propertyName] = {});

      const toJsonNow = (value, fn) => {
        return zx.utils.Promisify.resolveNow(value, value => {
          return zx.utils.Promisify.resolveNow(io.toJsonValue(info.endpoints, value, propertyDef, propertyPath), fn);
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
            arr = arr.map(item => io.toJsonValue(info.endpoints, item, propertyDef, propertyPath));
            return zx.utils.Promisify.allNow(arr, fn);
          });
        };

        const onArrayChange = evt => {
          if (info.endpoints.length == 0) {
            // No point serialising anything if there are no endpoints to send it to (this also avoids a warning) in toJsonValue
            // about it being impossible to serialise some values without an endpoint)
            return;
          }
          let data = evt.getData();
          if (data.type == "order") {
            let value = io.toJsonValue(info.endpoints, evt.getTarget(), propertyDef, propertyPath);
            return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "arrayReplace", value));
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
                this._onSerializedPropertyChange(object, propertyName, "arrayChange", data);
              });
            });
          }
        };

        const onValueChange = evt => {
          if (info.endpoints.length == 0) {
            // No point serialising anything if there are no endpoints to send it to (this also avoids a warning) in toJsonValue
            // about it being impossible to serialise some values without an endpoint)
            return;
          }
          let data = evt.getData();
          let oldData = evt.getOldData();
          if (propState.arrayChangeListenerId) {
            oldData.removeListenerById(propState.arrayChangeListenerId);
            propState.arrayChangeListenerId = null;
          }
          let value = io.toJsonValue(info.endpoints, data, propertyDef, propertyPath);
          if (data) {
            propState.arrayChangeListenerId = data.addListener("change", onArrayChange);
            return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "arrayReplace", value));
          } else {
            return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "setValue", value));
          }
        };

        propState.changeListenerId = object.addListener("change" + upname, onValueChange);
        let array = object["get" + upname]();
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
          if (info.endpoints.length == 0) {
            // No point serialising anything if there are no endpoints to send it to (this also avoids a warning) in toJsonValue
            // about it being impossible to serialise some values without an endpoint)
            return;
          }
          let data = evt.getData();
          if (data.type == "order") {
            let value = io.toJsonValue(info.endpoints, evt.getTarget(), propertyDef, propertyPath);
            return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "mapReplace", value));
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
                this._onSerializedPropertyChange(object, propertyName, "mapChange", data);
              });
            });
          }
        };

        const onValueChange = evt => {
          if (info.endpoints.length == 0) {
            // No point serialising anything if there are no endpoints to send it to (this also avoids a warning) in toJsonValue
            // about it being impossible to serialise some values without an endpoint)
            return;
          }
          let data = evt.getData();
          let oldData = evt.getOldData();
          if (propState.arrayChangeListenerId) {
            oldData.removeListenerById(propState.arrayChangeListenerId);
            propState.arrayChangeListenerId = null;
          }
          let value = io.toJsonValue(info.endpoints, data, propertyDef, propertyPath);
          if (data) {
            propState.arrayChangeListenerId = data.addListener("change", onMapContentsChange);
            return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "mapReplace", value));
          } else {
            return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "setValue", value));
          }
        };

        propState.changeListenerId = object.addListener("change" + upname, onValueChange);
        let array = object["get" + upname]();
        if (array) {
          propState.arrayChangeListenerId = array.addListener("change", onMapContentsChange);
        }

        // Normal values
      } else {
        propState.changeListenerId = object.addListener("change" + upname, evt => {
          if (info.endpoints.length == 0) {
            // No point serialising anything if there are no endpoints to send it to (this also avoids a warning) in toJsonValue
            // about it being impossible to serialise some values without an endpoint)
            return;
          }
          let value = io.toJsonValue(info.endpoints, evt.getData(), propertyDef, propertyPath);
          return zx.utils.Promisify.resolveNow(value, value => this._onSerializedPropertyChange(object, propertyName, "setValue", value));
        });
      }
    },

    /**
     * Called when a property has changed and there is serialized data to pass to the listeners
     *
     * @param {zx.io.persistence.IObject} object object which changed
     * @param {String} propertyName name of the property which changed
     * @param {String} changeType
     * @param {var} value
     */
    _onSerializedPropertyChange(object, propertyName, changeType, value) {
      let info = this._getInfoFor(object);
      info.endpoints.forEach(endpoint => endpoint.onWatchedPropertySerialized(object, propertyName, changeType, value));
    }
  }
});
