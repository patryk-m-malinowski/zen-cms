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
 * Represents a connection on the server to a client; this object MUST be disposed of
 *
 * @use(zx.utils.BigNumber)
 * @ignore(BigNumber)
 */
qx.Class.define("zx.io.remote.NetworkEndpoint", {
  extend: zx.io.persistence.Endpoint,

  construct(uuid) {
    super();
    this.__sentUuids = {};
    this.__queuedPackets = [];
    this.__lastPacketId = 0;
    this._pendingPromises = {};
    this.__availableJson = {};
    this.__uuid = uuid || this.toUuid();
    this.__receiveQueue = new zx.utils.Queue(packets => this._receivePacketsImpl(packets));

    zx.io.remote.NetworkEndpoint.__allEndpoints[this.__uuid] = this;
    if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server") === undefined) {
      throw new Error("You must set `zx.io.remote.NetworkEndpoint.server` as an environment variable in `compile.json` and recompile with `--clean`");
    }
  },

  destruct() {
    this.__availableJson = null;
    delete zx.io.remote.NetworkEndpoint.__allEndpoints[this.__uuid];
  },

  environment: {
    /** @type{Boolean} whether to trace I/O data */
    "zx.io.remote.NetworkEndpoint.traceIo": false,

    /** @type{Boolean} whether to trace session creation */
    "zx.io.remote.NetworkEndpoint.traceSessions": false,

    /** @type{Boolean} is this the server?  Set to true when compiling, so that remote methods are executed in the right place */
    "zx.io.remote.NetworkEndpoint.server": undefined
  },

  properties: {
    /** Whether to signal to the server that the connection will be short lived (ie usually a thin client); this is a
     * request not a requirement and simply allows the server to optimise its caching strategy for sessions */
    fastExpire: {
      init: false,
      check: "Boolean"
    }
  },

  members: {
    /** @type{Boolean} whether this endpoint is able to push packets to the other side */
    _supportsPushPackets: true,

    /** @type{String} the UUID for the browser instance */
    __uuid: null,

    /** @type{zx.utils.Queue} queue for receiving packets */
    __receiveQueue: null,

    __open: false,
    __sentOpened: false,
    __sentUuids: null,
    __lastPacketId: 0,
    __queuedPackets: null,
    _pendingPromises: null,
    __availableJson: null,

    /** @type{Map} list of property changes that are queued for delivery */
    __propertyChangeStore: null,

    /**
     * Whether the end point is open
     *
     * @return {Boolean}
     */
    isOpen() {
      return this.__open;
    },

    /**
     * @override
     */
    detachFromController() {
      let watcher = this.getController().getSharedWatcher();
      watcher && watcher.unwatchAll(this);
      super.detachFromController();
    },

    /**
     * Called to open the connection
     */
    async open() {
      if (this.isOpen()) {
        throw new Error("Cannot open an already open end point");
      }
      //this.debug(`Opening new endpoint, hash=${this.toHashCode()} uuid=${this.getUuid()}`);
      await this._startup();
      this.__open = true;
      let promise = new qx.Promise();
      this._queuePacket({
        type: "open",
        uuid: this.getUuid(),
        hash: this.toHashCode(),
        fastExpire: this.getFastExpire(),
        promise
      });

      this.flush();
      return await promise;
    },

    /**
     * Overridden by implementations to initialise any connections
     */
    async _startup() {
      // Nothing
    },

    /**
     * Closes the connection
     */
    async close() {
      if (!this.isOpen()) {
        throw new Error("Cannot close an already closed end point");
      }
      //this.debug(`Closing endpoint, hash=${this.toHashCode()} uuid=${this.getUuid()}`);
      this.__open = false;
      await this._shutdown();
      this.fireEvent("close");
    },

    /**
     * Gracefully closes, notifying the other side
     */
    async gracefulClose() {
      if (!this.isOpen()) {
        throw new Error("Cannot close an already closed end point");
      }
      this._queuePacket({
        type: "close"
      });

      this.flush();
      await this.close();
    },

    /**
     * Overridden by implementations to close any connections
     */
    async _shutdown() {
      // Nothing
    },

    /**
     * Called during reception of data by an end point to provide the data for objects
     * prior to deserialisation - this is necessary for references and recursive structures
     *
     * @param uuid {String} the UUID of the object
     * @param json {Object} the data
     */
    addAvailableJson(uuid, json) {
      this.__availableJson[uuid] = json;
    },

    /**
     * Reverses the data stored by `addAvailableJson`
     *
     * @param uuid {String}
     */
    removeAvailableJson(uuid) {
      delete this.__availableJson[uuid];
    },

    /**
     * @Override
     */
    getDataFromUuid(clazz, uuid) {
      if (!this.__availableJson[uuid]) {
        return null;
      }
      return {
        json: this.__availableJson[uuid]
      };
    },

    /**
     * Provides means to call methods on a remote object.
     *
     * @param uuid {String} the UUID of the object that has the method
     * @param methodName {String} the name of the method
     * @param ...args {...} method parameters
     * @return {Object?} returns whatever the method does
     */
    async callRemoteMethod(uuid, methodName, ...args) {
      if (!this.isOpen()) {
        throw new Error("Cannot call a method via a closed end point");
      }
      if (!this.__sentUuids[uuid]) {
        this.error("Cannot call remote method because it is not known");
        return;
      }
      let controller = this.getController();
      for (let i = 0; i < args.length; i++) {
        let arg = args[i];
        if (arg === null || arg === undefined) {
          continue;
        }
        if (controller.isCompatibleObject(arg)) {
          let uuid = arg.toUuid();
          if (!uuid || !this.hasObject(uuid)) {
            await this.put(arg);
            uuid = arg.toUuid();
          }
          args[i] = {
            uuid
          };
        } else if (arg instanceof qx.core.Object) {
          throw new Error(`Cannot call ${methodName} with argument ${arg} because it is ${arg.classname} which is not capable of being sent remotely`);
        } else {
          args[i] = {
            value: arg
          };
        }
      }
      this._sendPropertyChanges();
      let packet = {
        type: "callMethod",
        uuid,
        methodName,
        args,
        promise: new qx.Promise()
      };

      let promise = packet.promise;
      this._queuePacket(packet);
      this.flush();

      // NOTE:: you cannot await on `packet.promise`, because it will be deleted and then the result
      //  will always be `undefined`; this sounds like a bug, but WTH.  The fix is to get the promise
      //  into a local variable first and then await it.
      // ! see #__takeQueuedPackets for cause of deletion
      let result = await promise;
      return result;
    },

    /**
     * @Override
     */
    async _putImpl(obj) {
      await super._putImpl(obj);

      let uuid = obj.toUuid();
      let watcher = this.getController().getSharedWatcher();
      if (!watcher.isWatching(obj, this)) {
        this.watchObject(obj);
      }
    },

    /**
     * @Override
     */
    async _sendJson(uuid, json) {
      if (!this.isOpen()) {
        throw new Error("Cannot send via a closed end point");
      }
      if (this.__sentUuids[uuid]) {
        return;
      }
      this.__sentUuids[uuid] = "sent";
      this._queuePacket({
        type: "sendObject",
        uuid,
        json
      });
    },

    /**
     * Removes an object
     *
     * @param obj {qx.core.Object} Qooxdoo object to save
     */
    async remove(obj) {
      this.unwatchObject(obj);
    },

    /**
     * Starts watching an object for changes; the changes are recorded in a serialised form
     * and can be played back locally, or transmitted across a network first
     *
     * @param obj {zx.io.persistence.IObject} the object
     */
    watchObject(obj) {
      this.getController().getSharedWatcher().watchObject(obj, this);
    },

    /**
     * Reverses the effect of watchObject
     *
     * @param obj {zx.io.persistence.IObject} the object
     */
    unwatchObject(obj) {
      this.getController().getSharedWatcher().unwatchObject(obj, this);
      let uuid = obj.toUuid();
      delete this.__propertyChangeStore[uuid];
    },

    /**
     * Callback for changes to a property
     *
     * @param {zx.io.persistence.IObject} obj the object
     * @param {String} propertyName the name of the property that changed
     * @param {qx.io.persistence.ClassIo~WatchForChangesChangeType} changeType the type of change, eg "setValue", "arrayChange", etc
     * @param {Object} value native JSON representation of the property
     */
    onWatchedPropertySerialized(obj, propertyName, changeType, value) {
      if (this.isChangingProperty(obj, propertyName)) {
        return;
      }

      let io = this.getController().getClassIos().getClassIo(obj.constructor);
      let uuid = obj.toUuid();
      if (value && qx.Class.hasInterface(value.constructor, zx.io.persistence.IObject)) {
        let valueUuid = value.toUuid();
        if (!this.getController()._getKnownObject(valueUuid)) {
          this.putDependentObject(value);
        }
      }
      if (!this.__propertyChangeStore) {
        this.__propertyChangeStore = {};
      }
      let store = this.__propertyChangeStore[uuid];
      if (!store) {
        store = this.__propertyChangeStore[uuid] = {};
      }
      io.storeChange(store, propertyName, changeType, value);
    },

    /**
     * Returns the property change store - this is intended for use for testing only, and is
     * deliberately undocumented and subject to change without notice.
     */
    _getPropertyChangeStore() {
      return this.__propertyChangeStore;
    },

    /**
     * Replays a set of recorded changes on a known object, used for when a change set
     * is received over the network
     *
     * @param uuid {String} the UUID of the object
     * @param store {Map} map of changes
     * @return {Promise?} may return a promise if the change was asynchronous
     */
    restoreRemoteChanges(uuid, store) {
      let obj = this.getController()._getKnownObject(uuid);
      let io = this.getController().getClassIos().getClassIo(obj.constructor);
      return io.restoreChanges(this, store, obj);
    },

    /**
     * Sends property changes; only sends properties for objects which have already been sent.
     */
    _sendPropertyChanges() {
      let store = this.__propertyChangeStore;
      if (!store) {
        return;
      }
      this.__propertyChangeStore = null;
      let changes = {};
      let haveChanges = false;
      for (let uuid in store) {
        if (this.__sentUuids[uuid]) {
          changes[uuid] = store[uuid];
          haveChanges = true;
        }
      }

      if (haveChanges) {
        this._queuePacket({
          type: "sendPropertyChanges",
          changes
        });
      }
    },

    /**
     * Sets the URI mapping on all endpoints
     *
     * @param uri {String} the URI
     * @param {zx.io.persistence.IObject} object object to put
     */
    async putUriMapping(uri, object) {
      if (object) {
        let uuid = object.toUuid();
        if (!this.hasObject(uuid)) {
          await this.put(object);
          uuid = object.toUuid();
        }
        this._sendUriMapping(uri, uuid);
      } else {
        this._sendUriMapping(uri, null);
      }
    },

    /**
     * Sends a URI mapping
     *
     * @param uri {String} the URI to provide a mapping for
     * @param uuid {String} the UUID of the object to map to that URI
     */
    _sendUriMapping(uri, uuid) {
      if (!this.isOpen()) {
        throw new Error("Cannot send via a closed end point");
      }
      if (!this.__sentUuids[uuid]) {
        throw new Error("Cannot set a mapping for an unknown UUID");
      }
      this._queuePacket({
        type: "sendUriMapping",
        uri,
        uuid
      });
    },

    /**
     * Flushes the queued data to the other end
     */
    async flush() {
      await super.flush();
      this._sendPropertyChanges();
      if (this._supportsPushPackets) {
        let queuedPackets = this.__takeQueuedPackets();
        if (queuedPackets) {
          this._flushImpl(queuedPackets);
        }
      }
    },

    /**
     * Queues a packet
     *
     * @param {Object} packet
     */
    _queuePacket(packet) {
      this.__queuedPackets.push(packet);
    },

    /**
     * Gets the queued packets and removes them, in order to flush to the other side
     *
     * @return {Object[]?} packets
     */
    __takeQueuedPackets() {
      let queuedPackets = this.__queuedPackets;
      if (!queuedPackets || !queuedPackets.length) {
        return null;
      }

      this.__queuedPackets = [];
      queuedPackets.forEach(packet => {
        packet.packetId = this.toHashCode() + ":" + ++this.__lastPacketId;
        if (packet.promise) {
          this._pendingPromises[packet.packetId] = packet.promise;
          packet.promise = undefined;
        }
      });
      return queuedPackets;
    },

    /**
     * Implementation specific delivery of packets
     *
     * @param queuedPackets {Object[]} the packets
     */
    _flushImpl(queuedPackets) {
      throw new Error("No implementation for " + this.classname + "._flushImpl");
    },

    /**
     * Called by implementations to receive data from the other side
     *
     * @param packets {Object[]}
     * @return responses {Object[]} responses to send back
     */
    async _receivePackets(req, reply, packets) {
      if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.traceIo")) {
        if (packets?.length) {
          console.log(`${this.classname}: receive = ${JSON.stringify(packets, null, 2)}`);
        }
      }

      let response = await this.__receiveQueue.push({ req, reply, packets });
      return response;
    },

    /**
     * Serialises a value to send to the other side as JSON
     *
     * @param {*} value
     * @returns {Object}
     */
    async _serializeReturnValue(value) {
      const bson = require("bson");
      const controller = this.getController();
      if (!controller) {
        return null;
      }

      let puts = [];

      const serializeValue = value => {
        if (value === null || value === undefined) {
          return value;
        }
        if (value instanceof bson.Decimal128) {
          return new BigNumber(value.toString());
        }
        if (value instanceof qx.data.Array) {
          value = value.toArray();
        }
        if (qx.lang.Type.isArray(value)) {
          value = qx.lang.Array.clone(value);
          for (let i = 0; i < value.length; i++) {
            value[i] = serializeValue(value[i]);
          }
          return value;
        }
        const TYPEOF_PRIMITIVES = { string: 1, number: 1, boolean: 1 };
        if (controller.isCompatibleObject(value)) {
          let uuid = value.toUuid();
          if (!uuid || !this.hasObject(uuid)) {
            puts.push(this.put(value));
            uuid = value.toUuid();
          }
          return {
            _uuid: uuid,
            _classname: value.classname,
            _isObject: true
          };
        } else if (value instanceof qx.core.Object) {
          throw new Error(`Cannot return ${value} because it is ${value.classname} which is not capable of being sent remotely`);
        } else if (value instanceof Date || TYPEOF_PRIMITIVES[typeof value]) {
          return value;
        } else if (qx.lang.Type.isObject(value)) {
          if (typeof value._uuid == "string" && typeof value._classname == "string" && value._isObject === true) {
            throw new Error(`Cannot return ${value} because it has _uuid, _classname, and _isObject properties which means that it is not an object - instantiate it first`);
          }

          if (value.constructor !== Object) {
            const ac = zx.io.remote.NetworkEndpoint.__allowedConstructors.find(ac => ac.constructor === value.constructor);
            if (!ac) {
              throw new Error(`Cannot serialize; found an instance of ${value.constructor.name} which is not a serializable object`);
            }
            if ("method" in ac) {
              const acMethodResult = value[ac.method]();
              if (typeof acMethodResult === "string") {
                return acMethodResult;
              }
              if (typeof acMethodResult !== "object") {
                throw new Error(`Cannot serialize; result of ${value.constructor.name}.${ac.method} which is not a serializable object`);
              }
              return serializeValue(acMethodResult);
            }
            return JSON.stringify(value);
          }

          let result = {};
          for (let key in value) {
            result[key] = serializeValue(value[key]);
          }
          return result;
        }
        return {
          $$rawObject: value
        };
      };

      let result = serializeValue(value);
      await qx.Promise.all(puts);
      return result;
    },

    /**
     * Deserializes a value received from the other side
     *
     * @param {Object} value
     * @returns {*}
     */
    _deserializeReturnValue(value) {
      let promises = [];
      const deserializeValue = value => {
        if (value === null || value === undefined) {
          return value;
        }
        if (qx.lang.Type.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            value[i] = deserializeValue(value[i]);
            if (qx.lang.Type.isPromise(value[i])) {
              promises.push(value[i].then(newValue => (value[i] = newValue)));
            }
          }
          return value;
        }
        if (typeof value._uuid == "string" && typeof value._classname == "string" && value._isObject === true) {
          let clazz = qx.Class.getByName(value._classname);
          if (!clazz) {
            throw new Error(`Cannot return ${value._uuid} because there is no class called ${value._classname}`);
          }
          let promise = this.getController().getByUuid(clazz, value._uuid);
          if (promise) {
            value = promise;
          }
        }
        if (value.$$rawObject !== undefined) {
          return value.$$rawObject;
        }
        return value;
      };

      let result = deserializeValue(value);
      if (promises.length) {
        return qx.Promise.all(promises).then(() => result);
      }

      return result;
    },

    /**
     * Called to received the queued packets
     *
     * @param {*} context
     * @returns
     */
    async _receivePacketsImpl(context) {
      let { packets } = context;

      if (!packets || this.isDetachedFromController()) {
        return;
      }
      packets.forEach(packet => {
        if (packet.type == "sendObject") {
          this.__sentUuids[packet.uuid] = "receiving";
          this.addAvailableJson(packet.uuid, packet.json);
        }
      });

      const sortSendPropertyChangesFirst = (l, r) => {
        if (l.type == "sendPropertyChanges" && r.type != "sendPropertyChanges") {
          return -1;
        } else if (l.type == "sendPropertyChanges" && r.type != "sendPropertyChanges") {
          return 1;
        }
        return 0;
      };

      //sort the packets so we handle sendPropertyChanges first.
      packets.sort(sortSendPropertyChangesFirst);

      let waitForAll = async () => {
        if (this.getController()) {
          await this.getController().waitForAll();
        }
      };
      let watcher = this.getController().getSharedWatcher();

      for (let i = 0; i < packets.length; i++) {
        let packet = packets[i];

        if (packet.type == "sendObject") {
          let clazz = qx.Class.getByName(packet.json._classname);
          if (!clazz) {
            throw new Error(`Cannot receive object of class ${packet.json._classname} because it does not exist`);
          }
          let obj = await qx.Promise.resolve(this.getController().getByUuidNoWait(clazz, packet.uuid, true));
          if (obj) {
            if (this.__sentUuids[packet.uuid] && this.__sentUuids[packet.uuid] !== "receiving") {
              this.error(`Received sendObject multiple times for UUID ${packet.uuid}, status=${this.__sentUuids[packet.uuid]}`);
            }
            this.__sentUuids[packet.uuid] = "received";
            zx.io.remote.NetworkEndpoint.setEndpointFor(obj, this);

            if (!watcher.isWatching(obj, this)) {
              this.watchObject(obj);
            }
          }
        } else if (packet.type == "sendPropertyChanges") {
          let changes = packet.changes;
          for (let uuids = Object.keys(changes), uuidsIndex = 0; uuidsIndex < uuids.length; uuidsIndex++) {
            let uuid = uuids[uuidsIndex];
            await this.restoreRemoteChanges(uuid, changes[uuid]);
          }
        } else if (packet.type == "sendUriMapping") {
          if (!packet.uuid) {
            this.getController().addUriMapping(packet.uri, null);
          } else {
            let obj = await this.getController().getByUuidNoWait(null, packet.uuid, true);
            this.getController().receiveUriMapping(packet.uri, obj);
          }
        } else if (packet.type == "callMethod") {
          await waitForAll();
          let controller = this.getController();
          let object = await controller.getByUuid(null, packet.uuid);
          let args = packet.args || [];

          for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            if (!arg) {
              continue;
            }
            if (arg.hasOwnProperty("value")) {
              args[i] = arg.value;
              continue;
            }
            if (qx.core.Environment.get("qx.debug")) {
              this.assertTrue(!!arg.uuid);
            }

            let obj = await this.getController().getByUuid(null, arg.uuid);
            args[i] = obj;
          }

          let result = undefined;
          let exception = undefined;
          try {
            result = await object[packet.methodName].apply(object, args);
          } catch (e) {
            this.error(`Error calling remote method ${packet.methodName} on ${object.toUuid()}: ${e.message}`);
            exception = e;
          }

          let resultPacket = {
            originPacketId: packet.packetId,
            type: "return",
            methodName: packet.methodName // methodName only really needed for debugging
          };
          if (exception) {
            resultPacket.exception = {
              message: exception.message
            };
            if (qx.core.Environment.get("qx.debug")) {
              resultPacket.exception.stack = exception.stack;
            } else {
              // Delete actual stack traces in production
              let str = exception.stack || "";
              let pos = str.indexOf("\n");
              if (pos > -1) {
                str = str.substring(0, pos);
              }
              resultPacket.exception.stack = str;
            }
          } else {
            resultPacket.result = await this._serializeReturnValue(result);
          }

          this._queuePacket(resultPacket);

          //
        } else if (packet.type == "return") {
          await waitForAll();
          if (qx.core.Environment.get("qx.debug")) {
            let str = packet.originPacketId;
            let pos = str.indexOf(":");
            let hash = str.substring(0, pos);
            if (hash != this.toHashCode()) {
              throw new Error(`Received packet ID for wrong end point, found ${hash} expected ${this.toHashCode()}`);
            }
            let index = parseInt(str.substring(pos + 1), 10);
            if (isNaN(index) || index < 1 || index > this.__lastPacketId) {
              throw new Error("Received invalid index in packet ID");
            }
          }

          let promise = this._pendingPromises[packet.originPacketId];
          delete this._pendingPromises[packet.originPacketId];
          if (!promise) {
            this.error("No promise to return to! - methodName=" + packet.methodName);
            return;
          }

          if (packet.exception) {
            let error = new Error(packet.exception.message);
            error.stack = packet.exception.stack;
            promise.reject(error);
          } else {
            let result = this._deserializeReturnValue(packet.result);

            if (result === undefined) {
              promise.resolve();
            } else {
              promise.resolve(result);
            }
          }

          // Upload
        } else if (packet.type == "upload") {
          await waitForAll();

          let source = packet.sourceUuid ? await this.getController().getByUuid(null, packet.sourceUuid) : null;
          if (!source && packet.sourceQxObjectId) {
            source = qx.core.Id.getQxObject(packet.sourceQxObjectId);
          }
          if (!source && packet.sourceQxHashCode) {
            source = qx.core.ObjectRegistry.fromHashCode(packet.sourceQxHashCode);
          }
          let result = await this._deserializeReturnValue(packet.result);
          if (source) {
            await source.onUploadCompleted(result);
          }

          // Close
        } else if (packet.type == "close") {
          this.__open = false;
          this.fireEvent("close");

          // Open
        } else if (packet.type == "open") {
          if (qx.core.Environment.get("qx.debug")) {
            if (packet.uuid != this.getUuid()) {
              throw new Error(`Open received unexpected UUID, LOCAL hash=${this.toHashCode()}, LOCAL uuid=${this.getUuid()}, REMOTE hash=${packet.hash}, REMOTE uuid=${packet.uuid}`);
            }
          }
          if (this.__sentOpened) {
            this.error(`Unexpected open after opened has been sent`);
          }
          this.__openOriginPacketId = packet.packetId;
          this.grabPutQueue();
          try {
            if (qx.core.Environment.get("qx.debug")) {
              //this.debug(`Remote has opened this endpoint, LOCAL hash=${this.toHashCode()}, LOCAL uuid=${this.getUuid()}, REMOTE hash=${packet.hash}, REMOTE uuid=${packet.uuid}`);
            }
            if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
              let uris = this.getController().getUriMappings();
              await qx.Promise.all(
                Object.keys(uris).map(async uri => {
                  let obj = uris[uri];
                  await this.put(obj);
                  this._sendUriMapping(uri, obj.toUuid());
                })
              );
            }
            this.fireEvent("open");
            this._queuePacket({
              originPacketId: this.__openOriginPacketId,
              type: "return"
            });
          } finally {
            this.releasePutQueue();
          }
          /*
          if (!this.__sentOpened) {
            responses.push({
              originPacketId: this.__openOriginPacketId,
              type: "return"
            });
          }
          */
          this.__sentOpened = true;
        }
      }
      await waitForAll();

      packets.forEach(packet => {
        if (packet.type == "sendObject") {
          this.removeAvailableJson(packet.uuid, packet.values);
        }
      });

      if (!this.getController()) {
        return [];
      }
      await this.getController().flush();
      let responses = this.__takeQueuedPackets() || [];
      if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.traceIo")) {
        if (responses.length) {
          console.log(`${this.classname}: responses = ${JSON.stringify(responses, null, 2)}`);
        }
      }

      return responses;
    },

    /**
     * Called when a file is being uploaded
     *
     * @param {*} req
     * @param {*} reply
     * @returns
     */
    async _uploadFile(req, reply) {
      if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
        let controller = this.getController();

        const parts = req.parts();

        for await (const part of parts) {
          if (part.file) {
            let fields = {};
            for (let key of Object.keys(part.fields)) {
              if (part.fields[key].value) {
                fields[key] = decodeURIComponent(part.fields[key].value);
              }
            }

            let target = await controller.getByUuid(null, fields.targetUuid);
            if (!target) {
              throw new Error(`Cannot find target for upload for ${JSON.stringify(fields)}`);
            }
            if (!qx.Class.hasInterface(target.constructor, zx.io.remote.IUploadReceiver)) {
              throw new Error(`Target for upload for ${JSON.stringify(fields)} is the wrong type`);
            }
            let uploadingFile = target.getUploadingFile(part.filename, fields);
            let result = (await uploadingFile.writeFromStream(part.file)) || null;
            uploadingFile.dispose();
            let resultPacket = {
              type: "upload",
              sourceUuid: fields.sourceUuid,
              sourceQxObjectId: fields.sourceQxObjectId,
              sourceQxHashCode: fields.sourceQxHashCode,
              result: await this._serializeReturnValue(result)
            };

            this._queuePacket(resultPacket);
          }
        }

        return reply.json({
          status: "ok"
        });
      }
    },

    /**
     * @return {String} The endpoints UUID
     */
    getUuid() {
      return this.__uuid;
    },

    /**
     * Detects whether the given UUID has been sent to the client
     *
     * @param {String} uuid
     * @returns {Boolean}
     */
    hasObject(uuid) {
      return !!this.__sentUuids[uuid];
    }
  },

  statics: {
    // Stream that calculates the SHA-256 of the data that it passes
    ShaStream: null,

    /** @type{Object} list of classes already processed */
    __remoteClasses: {},

    /** @type{zx.io.remote.NetworkEndpoint} the default end point for calling remote methods */
    __defaultEndpoint: null,

    /** @type{Map} map of all end points indexed by hash code */
    __allEndpoints: {},

    /** @type {Array<{ constructor: new (...args: any[]) => any; method?: string }>} */
    __allowedConstructors: [],

    /**
     * Add constructors which are permitted to be serialized.
     *
     * A method may be provided, which is the name of a method on the class which either;
     * - returns a string representation of the object
     * - returns a POJO representation of the object
     * If the method returns a POJO, the POJO is used to continue serializing the object.
     * If no method is provided, the object is serialized with `JSON.stringify` instead.
     *
     * Note: currently, the objects are not automatically deserialized into their original class on
     * the client
     *
     * Note: if multiple constructors match due to inheritance, the earliest added constructor spec
     * will be used regardless of if it is the most specific option
     * @param {Array<{ constructor: new (...args: any[]) => any; method?: string }>} specs
     * @example
     * ```js
     * qx.Class.define('app.MyClass', {
     *   // ...
     *   defer() {
     *     zx.io.remote.NetworkEndpoint.addAllowedConstructors(
     *       { constructor: SomeLibraryClass },
     *       {
     *         constructor: OtherLibraryClass,
     *         method: 'asJson'
     *       },
     *     );
     *   }
     * })
     * ```
     */
    addAllowedConstructors(...specs) {
      this.__allowedConstructors.push(...specs);
    },

    /**
     * Adds a class which is remote capable, usually called automatically by `zx.io.persistence.ClassIo`; safe to
     * call multiple times
     *
     * @param {Class<zx.io.persistence.Object} clazz
     */
    initialiseRemoteClass(clazz) {
      if (!qx.Class.isSubClassOf(clazz, zx.io.persistence.Object)) {
        qx.log.Logger.error("Cannot initialise remote class because it is not derived from zx.io.persistence.Object");
        return;
      }
      for (let tmp = clazz; tmp && tmp != zx.io.persistence.Object; tmp = tmp.superclass) {
        zx.io.remote.NetworkEndpoint.__initialiseRemoteClassImpl(tmp);
      }
    },

    /**
     * Sets the default end point for use when calling remote methods
     *
     * @param {zx.io.remote.NetworkEndpoint} endpoint
     */
    setDefaultEndpoint(endpoint) {
      this.__defaultEndpoint = endpoint;
    },

    /**
     * Returns the Endpoint used to create an object, or null if it was created locally
     *
     * @param {zx.io.persistence.IObject} obj
     * @returns {zx.io.remote.NetworkEndpoint}
     */
    getEndpointFor(obj) {
      let uuid = (obj.$$zxIo && obj.$$zxIo.endpointUuid) || null;
      if (!uuid) {
        if (qx.Class.hasInterface(obj.constructor, zx.io.persistence.IObject)) {
          return this.__defaultEndpoint;
        }
        return null;
      }
      let endpoint = zx.io.remote.NetworkEndpoint.__allEndpoints[uuid];
      return endpoint;
    },

    /**
     * Sets the Endpoint used to create an object
     *
     * @param {zx.io.persistence.IObject} obj
     * @param {zx.io.remote.NetworkEndpoint} endpoint
     */
    setEndpointFor(obj, endpoint) {
      if (!obj.$$zxIo) {
        obj.$$zxIo = {};
      }
      if (qx.core.Environment.get("qx.debug")) {
        qx.core.Assert.assertTrue(!obj.$$zxIo.endpointUuid || obj.$$zxIo.endpointUuid == endpoint.getUuid());
      }
      obj.$$zxIo.endpointUuid = endpoint.getUuid();
    },

    /**
     * Called to initialise the remote-capable class, to replace the remote methods with remote calls
     */
    __initialiseRemoteClassImpl(clazz) {
      const EP = zx.io.remote.NetworkEndpoint;

      // Get a list of method names that need wrapping
      if (EP.__remoteClasses[clazz.classname]) {
        return;
      }
      EP.__remoteClasses[clazz.classname] = true;

      const PROPERTY_PREFIXES = {
        get: true,
        set: true,
        init: true,
        reset: true
      };

      let methods = {};
      let hasWithRequest = false;

      Object.keys(clazz.prototype)
        .filter(v => typeof clazz.prototype[v] == "function" && v != "constructor" && v != "destruct")
        .forEach(name => {
          // Exclude any methods which are property accessors
          let pos = -1;
          for (let i = 0; i < name.length; i++) {
            if (qx.lang.String.isUpperCase(name[i])) {
              pos = i;
              break;
            }
          }
          if (pos > -1) {
            let prefix = name.substring(0, pos);
            if (PROPERTY_PREFIXES[prefix]) {
              let propertyName = qx.lang.String.firstLow(name.substring(pos));
              if (qx.Class.hasProperty(clazz, propertyName)) {
                return false;
              }
            }
          }

          // And then filter by the annotations
          let annos = qx.Annotation.getMember(clazz, name, zx.io.remote.anno.Method);
          if (annos.length > 0) {
            methods[name] = annos;
          }
        });

      // If we're on the client, then wrap it with a call to the remote method
      if (!qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
        Object.keys(methods).forEach(methodName => {
          let method = clazz.prototype[methodName];
          clazz.prototype[methodName] = EP.__createRemoteMethod(clazz, methodName);
          clazz.prototype[methodName].$$zxIo = { originalMethod: method };
        });

        // Else we're on the server
      } else {
        Object.keys(methods).forEach(methodName => {
          let method = clazz.prototype[methodName];
          let anno = methods[methodName][0];

          // In debug mode we check that the method always returns a promise
          if (qx.core.Environment.get("qx.debug")) {
            clazz.prototype[methodName] = EP.__createLocalCheckMethod(clazz, methodName);
            clazz.prototype[methodName].$$zxIo = { originalMethod: method };
            method = clazz.prototype[methodName];
          }

          if (anno.isWithRequest) {
            if (!method.$$zxIo) {
              method.$$zxIo = {};
            }
            method.$$zxIo.withRequest = true;
            hasWithRequest = true;
          }
        });
      }
      if (hasWithRequest) {
        let classAnnos = qx.Annotation.getClass(clazz, zx.io.remote.anno.Class);
        let anno = classAnnos.length ? classAnnos[classAnnos.length - 1] : null;
        if (anno && anno.getProxy() != "always") {
          throw new Error(`Class ${clazz.classname} has withRequest methods but this is incompatible with classes which are not proxied`);
        }
      }
    },

    /**
     * Creates a method that calls the remote method
     *
     * @param clazz {Class} the class
     * @param methodName {String} the name of the method
     * @return {Function}
     */
    __createRemoteMethod(clazz, methodName) {
      if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
        throw new Error("zx.io.remote.NetworkEndpoint.__createRemoteMethod is not supported on the server (use a specific endpoint instead)");
      } else {
        return function () {
          return zx.io.remote.NetworkEndpoint.callRemoteMethod(this, methodName, qx.lang.Array.fromArguments(arguments));
        };
      }
    },

    /**
     * Creates a method that checks that the method returns a promise
     *
     * @param clazz {Class} the class
     * @param methodName {String} the name of the method
     * @return {Function}
     */
    __createLocalCheckMethod(clazz, name) {
      if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
        return function () {
          let originalMethod = clazz.prototype[name].$$zxIo?.originalMethod;
          let args = qx.lang.Array.fromArguments(arguments);
          let result = originalMethod.apply(this, args);
          if (result && typeof result.then != "function") {
            this.error(`The method ${clazz.classname}.${name} did not return a promise, but it is a remote function and will always be promisified on the client`);
          }
          return result;
        };
      } else {
        throw new Error("zx.io.remote.NetworkEndpoint.__createLocalCheckMethod is only supported on the server");
      }
    },

    /**
     * This is the implementation behind `__createRemoteMethod`, and makes the remote call actually happen
     *
     * @param object {zx.io.persistence.Object} the object instance
     * @param name {String} the name of the method
     * @param varargs {[...]} the arguments to the method
     * @return {Promise<*>}
     */
    async callRemoteMethod(object, name, varargs) {
      if (!qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
        let endpoint = zx.io.remote.NetworkEndpoint.getEndpointFor(object);
        if (endpoint) {
          if (!endpoint.hasObject(object.toUuid())) {
            await endpoint.put(object);
          }
          let promise = endpoint.callRemoteMethod(object.toUuid(), name, ...varargs);
          return await promise;
        } else {
          let result = object.constructor.prototype[name].$$zxIo?.originalMethod.call(object, ...varargs);
          if (result && typeof result.then != "function") {
            this.error(`The method ${object.classname}.${name} did not return a promise, but it is a remote function and will be promisified when used remotely`);
          }
          return await result;
        }
      } else {
        throw new Error("zx.io.remote.NetworkEndpoint.callRemoteMethod is not supported on the server (use a specific endpoint instead)");
      }
    }
  },

  defer(statics) {
    if (qx.core.Environment.get("zx.io.remote.NetworkEndpoint.server")) {
      const stream = require("stream");

      class ShaStream extends stream.Writable {
        constructor(algorithm) {
          super();
          this.hashAlgorithm = require("sha.js")(algorithm);
          this.__promise = new qx.Promise();
          this.on("finish", () => {
            this.__promise.resolve(this.toHash());
          });
        }
        async done() {
          return await this.__promise;
        }
        _write(chunk, encoding, callback) {
          this.hashAlgorithm.update(chunk);
          callback();
        }
        toHash() {
          const hash = this.hashAlgorithm.digest("hex");
          return hash;
        }
      }

      zx.io.remote.NetworkEndpoint.ShaStream = ShaStream;
    }
  }
});
