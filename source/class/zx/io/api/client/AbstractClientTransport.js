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
 *    Patryk Malinowski (@patryk-m-malinowski)
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************ */

/**
 * Basic implementation of the IClientTransport interface.
 */
qx.Class.define("zx.io.api.client.AbstractClientTransport", {
  type: "abstract",
  extend: qx.core.Object,

  /**
   *
   * @param {string?} serverUri URI identifiying the server. Should include the hostname and the route to ZX remote API calls.
   * For example, if the server is running at http://localhost:3000 and its route for its HTTP server transport is /zx-api,
   * then the serverUri should be http://localhost:3000/zx-api
   */
  construct(serverUri) {
    super();

    if (serverUri) {
      this.setServerUri(serverUri);
    }

    this.__pollTimer = new zx.utils.Timeout(null, this.__poll, this).set({
      recurring: true,
      duration: this.getPollInterval(),
      enabled: this.getPolling()
    });
  },

  destruct() {
    this.__pollTimer.dispose();
    this.__pollTimer = null;
  },

  events: {
    /**
     * @type {zx.io.api.IRequestJson}
     * This event needs to be fired when a message is received from the server.
     */
    message: "qx.event.type.Data"
  },

  properties: {
    serverUri: {
      check: "String",
      event: "changeServerUri",
      apply: "_applyServerUri",
      nullable: true,
      init: null
    },

    /**
     * Whether we should poll always i.e. even when there are no subscriptions,
     * just to test the connection.
     */
    pollAlways: {
      init: false,
      check: "Boolean",
      event: "changePollAlways"
    },

    /**
     * If enabled, this transport will poll to the server
     * every set interval (property: pollInterval)
     */
    polling: {
      init: false,
      check: "Boolean",
      event: "changePolling",
      apply: "_applyPolling"
    },

    /**
     * How often to poll the server for messages
     */
    pollInterval: {
      init: 1000,
      event: "changePollInterval",
      check: "Integer",
      apply: "_applyPollInterval"
    },

    /**
     * If specified, this callback will be called if an exception is thrown during polling.
     * This allows you to handle polling exceptions, which may be common if the server is not always available.
     * The callback will be passed the exception as an argument.
     * If this callback is not specified, polling exceptions will be thrown as normal.
     *
     */
    pollExceptionCallback: {
      init: null,
      nullable: true,
      check: "Function"
    },

    /**
     * If specified, this encryption manager will be used to encrypt messages
     * before they are sent to the server,
     * and to decrypt messages received from the server.
     *
     * Ideally, you should use this object in your implementation of postMessage
     * and in your received message event handler.
     */
    encryptionMgr: {
      init: null,
      nullable: true,
      check: "zx.io.api.crypto.IEncryptionMgr"
    },

    /**
     * If set, this will set the "Forward-To" header on all requests sent by this transport.
     * Note (2025-10-06) This is currently only supported by HttpClientTransport.
     */
    forwardTo: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeForwardTo"
    }
  },

  members: {
    /**
     * Timer used to poll all subscribed hostnames
     * every given interval
     *
     * @type {zx.utils.Timeout}
     */
    __pollTimer: null,

    /**
     * Number of subscriptions to the server
     */
    __subscriptions: 0,

    /**@type {string | null}*/
    __sessionUuid: null,

    /**
     * @param {string?} value
     * @param {string?} oldValue
     */
    _applyServerUri(value, oldValue) {
      if (oldValue) {
        this.reset(`Server URI changed from ${oldValue} to ${value}`);
      }
    },

    /**
     * Resets all state information for this transport and the APIs linked to this transport.
     * All session UUIDs and subscriptions will be lost.
     * @param {string?} reason
     */
    reset(reason) {
      let data = { type: "reset", headers: {}, body: { reason: reason || "Unknown" } };

      //this will cause all client APIs to reset their state
      this.fireDataEvent("message", { data: [data] });
      if (qx.core.Environment.get("qx.debug")) {
        this.assertNull(this.__sessionUuid, "Session UUID expected to be null after reset");
        this.assertEquals(0, this.__subscriptions, "Subscriptions expected to be 0 after reset");
      }
    },

    /**
     * Called EXCLUSIVELY in zx.io.api.client.AbstractClientApi when the API has subscribed to an event
     * @param {string} sessionUuid
     */
    subscribe(sessionUuid) {
      this.__sessionUuid = sessionUuid;
      this.__subscriptions++;
    },

    /**
     * Called EXCLUSIVELY in zx.io.api.client.AbstractClientApi when the API has unsubscribed from an event
     * @param {string} apiPath
     */
    unsubscribe() {
      this.__subscriptions--;
      if (this.__subscriptions == 0) {
        this.__sessionUuid = null;
      }

      if (qx.core.Environment.get("qx.debug")) {
        if (this.__subscriptions == -1) {
          console.warn("You have unsubscribed more times than you have subscribed. There is a bug in your code.");
          debugger;
        }
      }
    },

    /**
     * Gets a session UUID for a particular hostname of a client API URI
     * @param {string?} hostname
     */
    getSessionUuid() {
      return this.__sessionUuid;
    },

    /**
     * Posts a message to the server.
     * @abstract
     * @param {string} path The path the the request. Consists of the API's path (if it has one), and the method name (if it's for a method call)
     * @param {zx.io.api.IRequestJson} requestJson
     * @returns {*}
     */
    postMessage(path, requestJson) {
      throw new Error(`Abstract method 'postMessage' of class ${this.classname} not implemented`);
    },

    /**
     * Polls the hostname for this transport,
     * if we have subscriptions.
     *
     * @returns {Promise<void>}
     */
    async __poll() {
      if (!this.getServerUri()) {
        return;
      }

      if (!this.getPollAlways() && this.__subscriptions === 0) {
        return;
      }
      let requestJson = { headers: { "Session-Uuid": this.__sessionUuid }, type: "poll", body: {} };

      try {
        await this.postMessage(null, requestJson);
      } catch (e) {
        if (this.getPollExceptionCallback()) {
          this.getPollExceptionCallback()(e);
        } else {
          throw e;
        }
      }
    },

    /**
     * Apply function for the polling property
     */
    _applyPolling(value) {
      this.__pollTimer.setEnabled(value);
    },

    /**
     * Apply function for the pollInterval property
     */
    _applyPollInterval(value) {
      this.__pollTimer.setDuration(value);
    },

    /**
     * Processes a request and populates the response object.
     *
     * @param {zx.io.api.server.Request} request
     * @param {zx.io.api.server.Response} response
     *
     * Note (2025-10-07): This currently work in HttpClientTransport only.
     * Many other transports (e.g. WebSocket, Node Worker) do not have a default way of tracking responses for requests like HTTP does.
     * AbstractClientApi implements this logic by tracking requests and responses by request IDs.
     * It would be better if this logic were done in the transport instead of the API,
     * but we don't want to go down the rabbit hole of changing the code at this point.
     */
    sendRequest(request, response) {
      throw new Error(`${this.classname}.sendRequest is not supported by this transport.`);
    }
  },

  statics: {
    MAX_CONSECUTIVE_POLLING_FAILURES: 10
  }
});
