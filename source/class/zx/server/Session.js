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
 * Represents a session
 */
qx.Class.define("zx.server.Session", {
  extend: qx.core.Object,

  /**
   * Constructor
   *
   * @param {zx.server.SessionManager} manager
   * @param {var?} loadedSessionData
   */
  construct(manager, loadedSessionData, initialUrl) {
    super();

    this.__values = new zx.data.Map();
    this.__manager = manager;
    this.__initialUrl = initialUrl;
    if (loadedSessionData) {
      this.importSession(loadedSessionData);
    }
    if (!loadedSessionData?.sessionId) {
      this.regenerate();
    }
    this.set("__initialUrl", initialUrl);
  },

  properties: {
    /**
     * @type {qx.data.Array<string>}
     * The list of ZX API names that this session is allowed to use.
     */
    authenticatedApis: {
      check: "qx.data.Array",
      initFunction: () => new qx.data.Array(),
      event: "changeAuthenticatedApis",
      nullable: false,
    },

    /** When the session will expire */
    expires: {
      init: null,
      nullable: true,
      check: "Date",
      event: "changeExpires"
    },

    /** The ID assiged to the session */
    sessionId: {
      nullable: false,
      check: "String",
      apply: "_applySessionId"
    },

    /** Whether the session is supposed to be persisted to the database */
    saveToDisk: {
      init: true,
      check: "Boolean"
    }
  },

  members: {
    /** @type{zx.data.Map} the values stored in the session */
    __values: null,

    /** @type{zx.server.SessionManager} the manager */
    __manager: null,

    /** @type{Integer} usage reference count */
    __useCount: null,

    /** @type{String} encrypted version of this.sessionId */
    __encryptedSessionId: null,

    /** @type{Boolean} whether the session has been modified */
    __modified: false,

    /**
     * Sets a value in the session; the value should be a primitive value.  If the
     * value is null or undefined then it will be deleted from the session (null cannot
     * be stored)
     *
     * @param {String} key
     * @param {Object?} value
     */
    set(key, value) {
      if (value === null || value === undefined) {
        this.__values.remove(key);
      } else {
        this.__values.put(key, value);
      }
      this.__modified = true;
    },

    /**
     * Returns a value
     *
     * @param {String} key
     * @param {Object?} defaultValue default value in case the named value does not exist
     * @returns
     */
    get(key, defaultValue) {
      if (!this.__values.containsKey(key)) {
        this.__values.put(key, defaultValue);
        return defaultValue;
      }
      return this.__values.get(key);
    },

    /**
     * Whether there are any values stored
     *
     * @returns {Boolean}
     */
    isEmpty() {
      return this.__values.isEmpty();
    },

    /**
     * Whether the session has expired
     *
     * @returns {Boolean}
     */
    hasExpired() {
      let dt = this.getExpires();
      return dt && dt <= Date.now();
    },

    /**
     * Increment reference counter, for use when multiple simultaneous requests
     * are happening
     */
    addUse() {
      this.__useCount++;
    },

    /**
     * Decrement reference counter, for use when multiple simultaneous requests
     * are happening
     */
    decUse() {
      this.__useCount--;
    },

    /**
     * Checks the reference counter to see if there are any requests using it
     */
    isInUse() {
      return this.__useCount > 0;
    },

    /**
     * Called to update the expiry date
     */
    touch() {
      let options = this.__manager.getCookieOptions();
      if (options.maxAge) {
        let dt = new Date(Date.now() + options.maxAge);
        this.setExpires(dt);
      }
      this.__modified = true;
    },

    /**
     * Apply for `sessionId`
     */
    _applySessionId(value) {
      const cookieSignature = require("cookie-signature");
      this.__encryptedSessionId = cookieSignature.sign(value, this.__manager.getSecret());
      this.__modified = true;
    },

    /**
     * Returns the encrypted session ID that is given to the client
     *
     * @returns {String}
     */
    getEncryptedSessionId() {
      return this.__encryptedSessionId;
    },

    /**
     * Generates a new session ID
     */
    regenerate() {
      const uid = require("uid-safe").sync;
      this.setSessionId(uid(24));
      this.__modified = true;
    },

    /**
     * Loads session data, eg from the database
     *
     * @param {Map} data
     */
    importSession(data) {
      if (data.sessionId) {
        this.setSessionId(data.sessionId);
      }
      this.setExpires(data.expires || null);
      this.__values.replace(data.values);
      this.__modified = false;
    },

    /**
     * Tracks whether the session has been modified and needs to be persisted to the database
     *
     * @returns {Boolean}
     */
    isModified() {
      return this.__modified;
    },

    /**
     * Marks the session as no longer modified
     */
    clearModified() {
      this.__modified = false;
    },

    /**
     * Exports session data, eg to the database
     *
     * @returns {Map}
     */
    exportSession() {
      return {
        sessionId: this.getSessionId(),
        expires: this.getExpires(),
        values: this.__values.toObject()
      };
    },

    /**
     * Returns the Cookie data
     *
     * @param {Boolean} secureConnection whether the user is connecting over HTTPS or not (changes what is permitted in the cookie)
     * @returns {Map}
     */
    getCookieConfiguration(secureConnection) {
      let cookieOptions = this.__manager.getCookieOptions();
      let secure = cookieOptions.secure;
      let sameSite = cookieOptions.sameSite;
      if (secure === "auto") {
        if (secureConnection === true) {
          secure = true;
        } else {
          sameSite = "Lax";
          secure = false;
        }
      } else {
        secure = this.secure;
      }

      return {
        path: cookieOptions.path || "/",
        httpOnly: cookieOptions.httpOnly !== undefined ? cookieOptions.httpOnly : true,
        secure: cookieOptions.secure,
        expires: this.getExpires() || cookieOptions.expires || new Date(Date.now() + cookieOptions.maxAge),
        sameSite,
        domain: cookieOptions.domain
      };
    }
  }
});
