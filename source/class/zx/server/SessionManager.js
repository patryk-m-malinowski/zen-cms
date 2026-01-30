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

const cookieSignature = require("cookie-signature");

/**
 * Implements session handling for Fastify.
 *
 * The stock fastify session handler is broken because it will not handle overlapping requests
 * properly - it will load/save the session from the store for every request, but this means that
 * if you have multiple overlapping requests for the same session, then you can get 2 loads, two
 * modifications to the session, and then two stores - meaning that the first set of session changes
 * is overwritten.
 */
qx.Class.define("zx.server.SessionManager", {
  extend: qx.core.Object,

  construct(uri, databaseName, collectionName) {
    super();
    this.__uri = uri;
    this.__databaseName = databaseName;
    this.__collectionName = collectionName;
    this.__sessionCache = new zx.utils.LruCache(500);
    this.__sessionJsonCache = {};
  },

  properties: {
    /** Encryption used for sending session Ids in cookies */
    secret: {
      init: null,
      nullable: true,
      check: "String"
    },

    /** Name of the cookie to use */
    cookieName: {
      init: null,
      nullable: true,
      check: "String"
    },

    /** Options for the cookie */
    cookieOptions: {
      init: {
        maxAge: 5 * 24 * 60 * 60 * 1000,
        sameSite: "strict",
        // This needs to be false unless on HTTPS (otherwise cookies will not be sent by @fastify/session)
        secure: false //sessionConfig.secureCookie === false ? false : true
      },
      nullable: false
    }
  },

  members: {
    /** @type{String} the URI of the database to connect to */
    __uri: null,

    /** @type{String} the name of the database */
    __databaseName: null,

    /** @type{String} the name of the collection */
    __collectionName: null,

    /** @type{MongoClient} the Mongo client instance */
    __mongo: null,

    /** @type{MongoClient.DB} the Mongo database */
    __db: null,

    /** @type{Boolean} true if it is a new database */
    __newDatabase: false,

    /** @type{MongoClient.Collection} the Mongo collection */
    __collection: null,

    /** @type{zx.utils.LruCache} cache of sessions, indexed by sessionId */
    __sessionCache: null,

    /**
     * @typedef {Object} SessionJson
     * @property {String} sessionId
     * @property {Date} loaded
     * @property {Object} values
     *
     * @type{Map<String,SessionJson} cache of session JSON, indexed by sessionId */
    __sessionJsonCache: null,

    /**
     * Opens the database connection
     */
    async open() {
      const { MongoClient } = require("mongodb");
      this.__mongo = new MongoClient(this.__uri);
      await this.__mongo.connect();
      this.__db = this.__mongo.db(this.__databaseName);
      let collections = await this.__db.collections();
      let exists = collections.find(coll => coll.collectionName == this.__collectionName);
      this.__newDatabase = !exists;
      this.__collection = this.__db.collection(this.__collectionName);

      await this.deleteExpiredSessions();
      this.__startDeleteExpiredSessionsTimer();
    },

    /**
     * Closes the database connection
     */
    async close() {
      if (this.__mongo) {
        this.__mongo.close();
        this.__mongo = null;
        this.__db = null;
        this.__collection = null;
      }
    },

    /**
     * Creates a new session and replaces whatever is there
     *
     * @param {import("fastify").FastifyRequest} request
     * @returns {zx.server.Session} the new session
     */
    newSession(request) {
      this.clearSession(request);
      return this.getSession(request, true);
    },

    /**
     * Gets the session, optionally creating it if it does not exist
     *
     * @param {Boolean} createIfMissing if true will create the session if it does not exist, otherwise returns null
     * @returns {zx.server.Session?} the session or null if not found
     */
    getSession(request, createIfMissing = false) {
      const createSession = values => {
        let session = new zx.server.Session(this, values, request.url);
        this.__sessionCache.put(session.getSessionId(), session);
        request.__sessionId = session.getSessionId();
        return session;
      };

      let sessionId = request.__sessionId || null;
      if (!sessionId) {
        if (!createIfMissing) {
          return null;
        }
        return createSession();
      }

      let session = this.__sessionCache.get(sessionId) || null;
      if (!session) {
        let cachedData = this.__sessionJsonCache[sessionId];
        if (cachedData) {
          delete this.__sessionJsonCache[sessionId];
          session = createSession(cachedData.values);
        } else if (createIfMissing) {
          session = createSession();
        }
      }

      return session;
    },

    /**
     * Clears the session and deletes it from the database
     *
     * @param {import("fastify").FastifyRequest} request
     * @returns {zx.server.Session} the new session
     */
    async disposeSession(request) {
      if (request.session) {
        let sessionId = request.session.getSessionId();
        request.session = null;
        this.__sessionCache.remove(sessionId);
        await this.__collection.deleteOne({ sessionId });
      }
    },

    /**
     * Clears the session from the request, without actually deleting it
     *
     * @param {import("fastify").FastifyRequest} request
     */
    clearSession(request) {
      if (request.session) {
        let sessionId = request.session.getSessionId();
        request.session.decUse();
        if (!request.session.isInUse()) {
          this.__saveSession(request);
          this.__sessionCache.remove(sessionId);
        }
        request.session = null;
      }
    },

    /**
     * Starts the timer to delete expired sessions
     */
    __startDeleteExpiredSessionsTimer() {
      this.__deleteExpiredSessionsTimer = setTimeout(() => this.__onExpiredSessionsTimer(), 30 * 1000);
    },

    /**
     * Kills the timer to delete expired sessions
     */
    __killDeleteExpiredSessionsTimer() {
      if (this.__deleteExpiredSessionsTimer) {
        clearTimeout(this.__deleteExpiredSessionsTimer);
        this.__deleteExpiredSessionsTimer = null;
      }
    },

    /**
     * Timer handler to delete expired sessions
     */
    async __onExpiredSessionsTimer() {
      this.__deleteExpiredSessionsTimer = null;
      await this.deleteExpiredSessions();
      if (!this.__mongo) {
        // no mongo means we've been shut down
        return;
      }
      this.__startDeleteExpiredSessionsTimer();
    },

    /**
     * Deletes expired sessions
     */
    async deleteExpiredSessions() {
      await this.__collection.deleteMany({ expires: { $lt: new Date() } });
      for (let sessionId of this.__sessionCache.keys()) {
        let session = this.__sessionCache.get(sessionId);
        if (session.hasExpired()) {
          this.__sessionCache.remove(sessionId);
        }
      }
      let oldestDateMs = Date.now() - 1 * 60 * 1000;
      for (let sessionId in this.__sessionJsonCache) {
        let sessionJson = this.__sessionJsonCache[sessionId];
        if (sessionJson.loaded.getTime() < oldestDateMs) {
          delete this.__sessionJsonCache[sessionId];
        }
      }
    },

    /**
     * onRequest Hook
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     */
    async _onRequest(request, reply) {
      // Find the session ID from the cookie if there is one
      let cookieOptions = this.getCookieOptions();
      let url = request.raw.url;
      if (url.indexOf(cookieOptions.path || "/") !== 0) {
        return;
      }

      let encryptedSessionId = request.cookies[this.getCookieName()];
      let sessionId = encryptedSessionId ? cookieSignature.unsign(encryptedSessionId, this.getSecret()) : null;
      request.__sessionId = sessionId;

      // If we have a sessionId, and we do not actually have a session yet, then load the session JSON
      //  while we can.  Cache this JSON, because we could get lots of requests, none of which cause
      //  us to create a `zx.server.Session` instance
      if (sessionId && !this.__sessionCache.get(sessionId) && !this.__sessionJsonCache[sessionId]) {
        let json = await this.__collection.findOne({ sessionId });
        if (json) {
          this.__sessionJsonCache[sessionId] = {
            sessionId: json.sessionId,
            loaded: new Date(),
            values: json
          };
        }
      }
    },

    /**
     * onSend Hook
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     * @param {var} payload
     */
    async _onSend(request, reply, payload) {
      let sessionId = request.__sessionId || null;
      let session = sessionId ? this.__sessionCache.get(sessionId) : null;
      if (!session || !session.getSessionId() || !this.__shouldSaveSession(request)) {
        return payload;
      }

      this.__saveSession(request);
      reply.setCookie(this.getCookieName(), session.getEncryptedSessionId(), session.getCookieConfiguration(this.__isConnectionSecure(request)));

      return payload;
    },

    /**
     * onResponse Hook
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     */
    async _onResponse(request, reply) {
      let session = request.session;
      if (!session) {
        return;
      }
      session.decUse();
      if (!session.isInUse()) {
        await this.__saveSession(request);
        if (session.hasExpired()) {
          await this.disposeSession(request);
        }
      }
    },

    /**
     * Test for whether the session should be persisted
     *
     * @param {import("fastify").FastifyRequest} request
     * @returns {Boolean}
     */
    __shouldSaveSession(request) {
      let cookieOptions = this.getCookieOptions();
      if (request.session.isEmpty()) {
        return false;
      }
      if (cookieOptions.secure !== true || cookieOptions.secure === "auto") {
        return true;
      }
      if (this.__isConnectionEncrypted(request)) {
        return true;
      }
      const forwardedProto = this.__getRequestProto(request);
      return forwardedProto === "https";
    },

    /**
     * Saves the session to the database
     *
     * @param {import("fastify").FastifyRequest} request
     */
    __saveSession(request) {
      if (this.__shouldSaveSession(request) && request.session.isModified()) {
        let session = request.session;
        let json = session.exportSession();
        let sessionId = session.getSessionId();
        session.clearModified();
        this.__collection.replaceOne({ sessionId: sessionId }, json, { upsert: true });
      }
    },

    /**
     * Gets the protocol
     *
     * @param {import("fastify").FastifyRequest} request
     * @returns {Boolean}
     */
    __getRequestProto(request) {
      return request.headers["x-forwarded-proto"] || "http";
    },

    /**
     * Test for whether the connection is secure
     *
     * @param {import("fastify").FastifyRequest} request
     * @returns {Boolean}
     */
    __isConnectionSecure(request) {
      if (this.__isConnectionEncrypted(request)) {
        return true;
      }
      return this.__getRequestProto(request) === "https";
    },

    /**
     * Test for whether the connection is encrypted
     *
     * @param {import("fastify").FastifyRequest} request
     * @returns {Boolean}
     */
    __isConnectionEncrypted(request) {
      let socket = request.raw.socket;
      return socket && socket.encrypted === true;
    },

    /**
     * Connects this to Fastify as a plugin
     *
     * @param {Fastify} fastify
     */
    registerWithFastify(fastify) {
      fastify.decorateRequest("__sessionId", null);
      let sessionManager = this;
      fastify.decorateRequest("session", {
        getter: function () {
          return sessionManager.getSession(this, false);
        }
      });
      fastify.decorateRequest("getSession", function () {
        return sessionManager.getSession(this, true);
      });
      fastify.addHook("onRequest", async (request, reply) => await this._onRequest(request, reply));
      fastify.addHook("onSend", async (request, reply, payload) => await this._onSend(request, reply, payload));
      fastify.addHook("onResponse", async (request, reply) => await this._onResponse(request, reply));
    }
  }
});
