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
 * Model class representing a request to the server,
 * Requests can be to subscribe to server events, or to call a method on the server
 * They are created by the transport class when a message is received from the client
 */
qx.Class.define("zx.io.api.server.Request", {
  extend: qx.core.Object,

  /**
   * @param {zx.io.api.server.AbstractServerTransport} transport The transport that received the message and created this request
   * @param {zx.io.api.IRequestJson} data The raw JSON message that this request is based on
   */
  construct(transport, data) {
    super();

    this.setTransport(transport);
    this.setHeaders(data.headers ?? {});
    this.setRawData(data);
    this.setBody(data.body ?? {});
    this.setPath(data.path ?? null);
    this.setType(data.type ?? "callMethod");

    let sessionUuid = this.getHeader("Session-Uuid");
    if (sessionUuid) {
      let session = zx.io.api.server.SessionManager.getInstance().getSessionByUuid(sessionUuid);
      if (session) {
        session.setLastActivity(new Date());
        this.setSession(session);
      }
    }
  },

  properties: {
    /**
     * @public get
     * @private set
     */
    type: {
      check: ["callMethod", "subscribe", "poll", "unsubscribe"],
      init: null
    },
    /**
     * The raw data received from the transport
     * Only valid when the request is a REST request
     */
    rawData: {
      check: "Object",
      init: null,
      event: "changeData"
    },
    /**
     * @public get
     * @private set
     * The transport that created this request
     */
    transport: {
      init: null,
      check: "zx.io.api.server.AbstractServerTransport"
    },

    /**
     * @public get
     * @private set
     * Only set when this request's type is "callMethod".
     * Sometimes it may be a forward-slash-separated string, e.g. "/prefix/apiName/methodName",
     * or it can be just a string, which is the method name
     */
    path: {
      init: null,
      nullable: true,
      check: "String"
    },

    /**
     * @public get
     * @private set
     * If this request is part of a session, this property will be set to the session object
     */
    session: {
      init: null,
      nullable: true,
      check: "zx.io.api.server.Session"
    },

    /**
     * @public get
     * @private set
     * @type {zx.io.api.IHeaders}
     */
    headers: {
      check: "Object"
    },

    /**
     * @type {zx.io.api.IRequestJson.IBody | string}
     * @public get
     * @private set
     */
    body: {
      init: null,
      nullable: true
    },

    /**
     * A key-value map representing the query string of the request
     * For HTTP requests, this is the query string in the URL
     */
    query: {
      check: "Object",
      initFunction: () => ({})
    },

    /**
     * A key-value map representing the URL path parameters
     * Only applicable to REST requests
     */
    pathArgs: {
      check: "Object",
      initFunction: () => ({})
    },

    /**
     * The REST method which initiated this request.
     * Only present if the request is a REST request,
     * and not initiated by a client API
     */
    restMethod: {
      init: null,
      nullable: true,
      check: ["GET", "POST", "PUT", "DELETE"]
    }
  },

  members: {
    /**
     *
     * Whether the request was initiated by an instance of zx.io.api.client.AbstractClientApi,
     * and not a basic REST request
     * @returns {boolean}
     */
    isFromClientApi() {
      return this.getHeader("Client-Api-Uuid") !== undefined || this.getType() === "poll";
    },
    /**
     * Makes sure that a session exists; if it already exists, nothing happens
     *
     * @return {zx.io.api.Session}
     */
    createSession() {
      let session = this.getSession();
      if (session) {
        return session;
      }

      let sessionUuid = this.getHeader("Session-Uuid");
      if (sessionUuid) {
        session = zx.io.api.server.SessionManager.getInstance().getSessionByUuid(sessionUuid);
      }

      if (!session) {
        session = new zx.io.api.server.Session(this.getTransport());
        zx.io.api.server.SessionManager.getInstance().addSession(session);
      }
      return session;
    },

    /**
     *
     * @param {string} key
     * @returns {*}
     */
    getHeader(key) {
      return this.getHeaders()[key];
    },

    /**
     *
     * @param {string} key
     * @param {*} value
     */
    setHeader(key, value) {
      this.getHeaders()[key] = value;
    },

    /**
     *
     * @param {string} key
     */
    removeHeader(key) {
      delete this.getHeaders()[key];
    },

    /**
     *
     * @returns {zx.io.api.IRequestJson}
     */
    toNativeObject() {
      return {
        type: this.getType(),
        path: this.getPath(),
        headers: this.getHeaders(),
        body: this.getBody()
      };
    }
  }
});
