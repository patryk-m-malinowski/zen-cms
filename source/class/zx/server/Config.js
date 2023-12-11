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

const path = require("path");
const fs = require("fs");

qx.Class.define("zx.server.Config", {
  extend: qx.core.Object,

  /**
   * Constructor
   */
  construct() {
    this.base(arguments);
  },

  /**
   * Destructor
   */
  destruct() {
    if (zx.server.Config.__instance === this) {
      zx.server.Config.__instance = null;
    }
  },

  environment: {
    /** @type{Class?} the class to use to load the config; null means to use zx.server.Config */
    "zx.server.Config.ConfigLoaderClass": null
  },

  members: {
    /** @type{Object} the configuration */
    _config: null,

    /** @type{String} the root directory from the config data, resolved as an absolute path */
    _rootDir: null,

    /**
     * Loads configuration file, but will only do it once
     *
     * @return {Object} the configuration
     */
    async loadConfig() {
      if (this._config) {
        return this._config;
      }
      let loadedData = await this._loadConfigImpl();
      this._config = loadedData.config;
      this._rootDir = path.resolve(loadedData.baseDir, this._config.directory || "website");
      return this._config;
    },

    /**
     * @typedef {Object} LoadConfigImplResult
     * @property {Object} config the loaded JSON configuration
     * @property {String} baseDir the base directory used to resolve relative paths, typically
     *  the directory of the config file
     *
     * @returns {LoadConfigImplResult}
     */
    async _loadConfigImpl() {
      let filename = this._getConfigFilename();
      let config = await zx.utils.Json.loadJsonAsync(filename);
      let localFilename = "local" + qx.lang.String.firstUp(filename);
      if (fs.existsSync(localFilename)) {
        let tmp = await zx.utils.Json.loadJsonAsync(localFilename);
        qx.lang.Object.mergeWith(config, tmp, true);
      }
      return {
        config: config,
        baseDir: path.dirname(path.resolve(filename))
      };
    },

    /**
     * Returns the filename to load (this exists to be overridden
     *
     * @returns {String}
     */
    _getConfigFilename() {
      return "cms.json";
    },

    /**
     * Returns the configuration data
     *
     * @return {Object} the data
     */
    getConfigData() {
      return this._config;
    },

    /**
     * Returns the root directory
     */
    getRootDir() {
      return this._rootDir;
    },

    /**
     * Helper method to resolve a filename relative to the application directory
     */
    resolveApp(...args) {
      return path.resolve(path.join(this._config.appDirectory || ".", ...args));
    },

    /**
     * Helper method to resolve a filename relative to the data directory
     */
    resolveData(...args) {
      return path.resolve(path.join(this._config.appDirectory || ".", ...args));
    }
  },

  statics: {
    /** @type {String} the resource root directory */
    RESOURCE_DIR: null,

    /** @type {Config} the instance */
    __instance: null,

    /**
     * Returns the current singleton instance
     *
     * @return {Config} the instance
     */
    getInstance() {
      if (!zx.server.Config.__instance) {
        let classname = qx.core.Environment.get("zx.server.Config.ConfigLoaderClass");
        let clazz = classname ? qx.Class.getByName(classname) : zx.server.Config;
        zx.server.Config.__instance = new clazz();
      }
      return zx.server.Config.__instance;
    },

    /**
     * Shortcut to getInstance().resolveApp
     * @returns {String}
     */
    resolveApp(...args) {
      return this.getInstance().resolveApp(...args);
    },

    /**
     * Shortcut to getInstance().resolveData
     * @returns {String}
     */
    resolveData(...args) {
      return this.getInstance().resolveData(...args);
    },

    /**
     * Shortcut that gets a singleton instance and loads the config if necessary
     *
     * @returns {Object} the raw config data
     */
    async getConfig() {
      return await zx.server.Config.getInstance().loadConfig();
    }
  },

  defer(statics) {
    // The resource dir is always the same on Qooxdoo v6 with the Qx Compiler
    statics.RESOURCE_DIR = qx.util.LibraryManager.getInstance().get("qx", "resourceUri") + path.sep;
  }
});
