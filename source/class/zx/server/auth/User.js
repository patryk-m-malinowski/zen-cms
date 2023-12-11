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
 * Every user is an instance of one of these documents.
 *
 */
qx.Class.define("zx.server.auth.User", {
  extend: zx.server.Object,
  include: [zx.server.auth.MUser],
  "@": new zx.io.remote.anno.Class().set({
    clientMixins: "zx.server.auth.MUser"
  }),

  construct() {
    this.base(arguments);
    this.set({
      permissions: new zx.data.IndexedArray().set({
        keyGenerator: perm => perm.getShortCode()
      }),
      roles: new zx.data.IndexedArray().set({
        keyGenerator: role => role.getShortCode()
      }),
      state: new zx.data.Map()
    });
  },

  properties: {
    /** Email address and login ID */
    username: {
      nullable: false,
      check: "String",
      event: "changeUsername",
      transform: "_transformUsername",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED]
    },

    /** Full name of the user */
    fullName: {
      init: "Unnamed User",
      nullable: false,
      check: "String",
      event: "changeFullName",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.DEFAULT]
    },

    /** Password */
    password: {
      init: null,
      nullable: true,
      check: "String",
      event: "changePassword",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED]
    },

    /** List of permissions assigned to this user */
    permissions: {
      init: null,
      nullable: true,
      check: "zx.data.IndexedArray",
      event: "changePermissions",
      transform: "_transformPermissions",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED]
    },

    /** List of roles assigned to this user */
    roles: {
      init: null,
      nullable: true,
      check: "zx.data.IndexedArray",
      event: "changeRoles",
      transform: "_transformRoles",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED]
    },

    /** Map of simple key/value pairs used for storing user state (eg UI state) */
    state: {
      init: null,
      nullable: true,
      check: "zx.data.Map",
      event: "changeState",
      "@": [zx.io.persistence.anno.Property.DEFAULT, zx.io.remote.anno.Property.PROTECTED]
    }
  },

  members: {
    /**
     * Logs the user into the current session
     *
     * @param {FastifyRequest} req
     */
    login(req) {
      req.session.set(this.classname, {
        userUuid: this.toUuid()
      });
    },

    /**
     * Checks whether the password matches this user
     *
     * @param {String} password
     * @returns
     */
    isPassword(password) {
      return this.getPassword() === zx.server.auth.User.encryptPassword(password);
    },

    /**
     * Changes the password, encrypting the value
     *
     * @param {String} password, in unencrypted form
     */
    changePassword(password) {
      this.setPassword(zx.server.auth.User.encryptPassword(password));
    },

    /**
     * Grants a permission
     *
     * @param {zx.auth.server.Permission|String} shortCode permission to add
     * @return {Boolean} true if the permission needed to be granted
     */
    async grantPermission(shortCode) {
      let perm = await zx.server.auth.Security.findPermission(shortCode);
      if (!perm) {
        throw new Error(`Cannot find permission to grant from ${shortCode}`);
      }
      if (!this.getPermissions().lookup(shortCode)) {
        this.getPermissions().push(perm);
        await this.save();
        return true;
      }
      return false;
    },

    /**
     * Removes a previously granted permission
     *
     * @param {zx.auth.server.Permission|String} shortCode permission to remove
     * @return {Boolean} true if the permission had previously been granted
     */
    async removePermission(shortCode) {
      let perm = await zx.server.auth.Security.findPermission(shortCode);
      if (!perm) {
        throw new Error(`Cannot find permission to remove from ${shortCode}`);
      }
      if (this.getPermissions().remove(perm)) {
        await this.save();
        return true;
      }
      return false;
    },

    /**
     * Transform for `username`
     */
    _transformUsername(value) {
      if (value) {
        value = value.toLowerCase();
      }
      return value;
    },

    /**
     * Transform for `permissions`
     */
    _transformPermissions(value, oldValue) {
      if (!oldValue) {
        return value;
      }
      oldValue.replace(value || []);
      return oldValue;
    },

    /**
     * Transform for `roles`
     */
    _transformRoles(value, oldValue) {
      if (!oldValue) {
        return value;
      }
      oldValue.replace(value || []);
      return oldValue;
    }
  },

  environment: {
    "zx.server.auth.User.classname": null
  },

  statics: {
    /**
     * Encrypts text using the password encryption mechanism
     *
     * @param {String} password
     * @returns
     */
    encryptPassword(password) {
      return password;
    },

    /**
     * Finds the class to be used for all users
     *
     * @returns {Class} the class to use
     */
    getUserClass() {
      let classname = qx.core.Environment.get("zx.server.auth.User.classname");
      if (classname == null) {
        return zx.server.auth.User;
      }
      let clazz = qx.Class.getByName(classname);
      if (!clazz || !qx.Class.isSubClassOf(clazz, zx.server.auth.User)) {
        throw new Error(`Invalid class for User objects - expected ${classname} but found ${clazz}`);
      }
      return clazz;
    },

    /**
     * Get the currently logged in user; if `req` is null, then it will attempt to use
     * the current request
     *
     * @param {fastify.Request?} req
     * @return {zx.server.auth.User}
     */
    async getUserFromSession(req) {
      if (!req) req = zx.server.WebServer.getCurrentRequest();
      let classname = qx.core.Environment.get("zx.server.auth.User.classname") || zx.server.auth.User.classname;
      let data = req.session.get(classname);
      if (!data || !data.userUuid) {
        return null;
      }
      let server = zx.server.Standalone.getInstance();
      let clazz = zx.server.auth.User.getUserClass();
      let user = await server.findOneObjectByType(clazz, {
        _uuid: data.userUuid
      });
      return user;
    },

    /**
     * Gets a user from the email address; returns null unless `create` is true, in which case
     * the user will be created if it does not already exist
     *
     * @param {String} email
     * @param {Boolean?} create
     * @return {zx.server.auth.User}
     */
    async getUserFromEmail(email, create) {
      let server = zx.server.Standalone.getInstance();
      let clazz = zx.server.auth.User.getUserClass();
      let user = await server.findOneObjectByType(clazz, {
        username: email.toLowerCase()
      });
      if (!user && create) {
        user = new clazz().set({
          username: email,
          fullName: ""
        });
        await user.save();
      }
      return user;
    }
  }
});
