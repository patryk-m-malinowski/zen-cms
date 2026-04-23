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

qx.Class.define("zx.server.auth.UserDiscovery", {
  extend: qx.core.Object,

  members: {
    __promise: null,

    /**
     * Called once on startup to initialise the discovery mechanism
     */
    async initialise() {
      // Nothing
    },

    /**
     * Gets a user from the email address; returns null unless `create` is true, in which case
     * the user will be created if it does not already exist.
     *
     * Do not override this method; override _getUserFromEmailImpl instead.
     *
     * This method calls _getUserFromEmailImpl which does the actual work of finding the user but it mutexes calls.
     *
     * @param {String} email
     * @param {Boolean?} create
     * @return {Promise<zx.server.auth.User>}
     */
    async getUserFromEmail(email, create) {
      if (this.__promise) {
        return this.__promise.then(() => this.getUserFromEmail(email, create));
      }

      let promise = this._getUserFromEmailImpl(email, create);
      this.__promise = promise;
      promise.then(user => {
        this.__promise = null;
        return user;
      });
      return await promise;
    },

    /**
     * Gets a user from the email address; returns null unless `create` is true, in which case
     * the user will be created if it does not already exist.
     * The implementation does not need to worry about any race conditions;
     * calls to this method are mutexed.
     *
     * Can be overridden.
     *
     * @param {String} email
     * @param {Boolean} create
     * @returns {Promise<zx.server.auth.User>}
     */
    async _getUserFromEmailImpl(email, create) {
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
