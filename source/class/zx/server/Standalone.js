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

const fs = require("fs-extra");
const path = require("path");

/**
 * This class implements stand alone processing of pages, and can be used by the unit tests
 * or for generating static websites (where the pages support being static)
 *
 * @use(zx.cms.content.ContainerPiece)
 * @use(zx.cms.content.ContentPiece)
 * @use(zx.cms.content.ThinClientCodePiece)
 * @use(zx.cms.content.FeaturePiece)
 * @use(zx.cms.website.Site)
 * @use(zx.utils.BigNumber)
 *
 * @asset(zx/thin/theme/materials/*)
 * @asset(zx/db/template/*)
 */
qx.Class.define("zx.server.Standalone", {
  extend: qx.core.Object,

  construct() {
    super();
    qx.log.appender.Formatter.setFormatter(new zx.utils.LogFormatter());
    if (zx.server.Standalone.__instance) {
      console.error("Multiple instances of zx.server.Standalone detected - this is probably not intentional");
    }
    zx.server.Standalone.__instance = this;

    this._objectsUrlsToId = {};
  },

  destruct() {
    if (zx.server.Standalone.__instance === this) {
      zx.server.Standalone.__instance = null;
    }
  },

  properties: {
    /** Adds extra debug output */
    enableDebug: {
      init: false,
      check: "Boolean"
    }
  },

  members: {
    /** {zx.server.Config} config */
    _config: null,

    /** {zx.io.persistence.db.Database} the database */
    _db: null,

    /** {zx.io.persistence.DatabaseController} the database persistance controller */
    _dbController: null,

    /** {zx.cms.website.Site} site configuration data */
    _site: null,

    /** {zx.cms.render.Renderer} the renderer for generating content */
    _renderer: null,

    /** Cache Data for object retrieved from the database */
    _objectsUrlsToId: null,

    /** @type{zx.server.auth.UserDiscovery} where to find zx.server.auth.User objects */
    __userDiscovery: null,

    /**
     * Called to start the server
     */
    async start() {
      let config = zx.server.Config.getInstance();
      if (qx.core.Environment.get("qx.debug")) {
        zx.test.TestRunner.runAll(zx.test.util.LruCache);
      }
      this._config = await zx.server.Config.getConfig();
      await this._enableHeapDumps();
      if (this._config.smtpServer) {
        await zx.server.email.EmailJS.initialise();
        await zx.server.email.SMTPClient.initialise();
      } else {
        console.warn("No SMTP server configuration, so sending emails not possible.");
      }
      await this._openDatabase();
      await this._initSite();
      await this._initRenderer();
      await this._initUserDiscovery();
    },

    /**
     * Enables heap dumps if configured; SIGHUP is used to trigger a heap dump
     */
    async _enableHeapDumps() {
      const exitProcess = () => {
        console.log("Exiting process as requested");
        process.removeAllListeners("SIGINT");
        process.removeAllListeners("SIGHUP");
        process.removeAllListeners("SIGUSR2");
        process.exit(0);
      };
      process.on("SIGUSR2", function () {
        console.log("SIGUSR2 received, exiting");
        exitProcess();
      });
      let enabled = false;
      if (this._config.heapdumps) {
        enabled = this._config.heapdumps.enabled;
        if (enabled === undefined) {
          enabled = qx.core.Environment.get("qx.debug");
        }
      }
      if (!enabled) {
        return;
      }
      let heapdumpDir = path.resolve(this._config.heapdumps.directory ? this._config.heapdumps.directory : path.join(this._config.directory, "heapdumps"));

      let runningHeapDumps = false;
      const writeHeapDump = async () => {
        if (runningHeapDumps) {
          console.log("Heap dump already in progress, ignoring request");
          return;
        }
        runningHeapDumps = true;
        await zx.utils.Path.makeDirs(heapdumpDir);
        const v8 = require("v8");
        let DF = new qx.util.format.DateFormat("yyyy-MM-dd'T'HH-mm-ss");
        let baseFilename = path.join(heapdumpDir, `heapdump-${DF.format(new Date())}-${process.pid}`);
        let filename = `${baseFilename}.heapsnapshot`;
        console.log(`Writing heap dump to ${filename}...`);
        let heapSnapshotStream = v8.getHeapSnapshot();
        let fileStream = fs.createWriteStream(filename);
        try {
          await new Promise((resolve, reject) => {
            fileStream.on("finish", resolve);
            fileStream.on("error", reject);
            heapSnapshotStream.pipe(fileStream);
          });
          console.log(`Heap dump written to ${filename}`);
        } catch (err) {
          console.error("Error writing heap dump: " + (err.stack || err));
        }
        if (qx.core.Environment.get("qx.dev.LeakDetector.enabled")) {
          let stats = qx.dev.LeakDetector.getInstance().getStaticsByClass();
          stats.sort((a, b) => a.key.localeCompare(b.key));
          let str = "";
          stats.forEach(stat => {
            str += `${stat.key}: ${stat.count}\n`;
          });
          await fs.promises.writeFile(`${baseFilename}-classes.txt`, str, "utf8");
          console.log("LeakDetector statistics: " + JSON.stringify(stats));
        }
        runningHeapDumps = false;
      };
      if (this._config.heapdumps.sigint) {
        let lastSigint = 0;
        process.on("SIGINT", function (code) {
          let now = Date.now();
          let diff = now - lastSigint;
          lastSigint = now;
          if (diff < 500) {
            console.log("SIGINT received twice within 0.5 seconds, ignoring");
            return;
          }
          if (diff < 5000) {
            console.log(`SIGINT received twice within 5 seconds (${diff}ms), exiting`);
            exitProcess();
          }
          console.log("SIGINT received, collecting heap dump");
          setTimeout(writeHeapDump, 500);
        });
      }
      process.on("SIGHUP", function (code) {
        console.log("SIGHUP received, collecting heap dump");
        writeHeapDump();
      });
    },

    /**
     * Returns the name of the website; used to identify urls when the database is shared between multiple websites
     *
     * @returns {String} "localhost" if not configured
     */
    getWebsiteName() {
      return this._config?.websiteName || "localhost";
    },

    /**
     * Called to stop the server
     */
    async stop() {
      if (this._site) {
        this._site.dispose();
        this._site = null;
      }
      this._renderer.dispose();
      this._renderer = null;
      await this._dbController.stop();
      this._dbController.dispose();
      this._dbController = null;
      if (this._db != null) {
        this._db.close();
        this._db.dispose();
      }
      this._db = null;
    },

    /**
     * Opens the database
     */
    async _openDatabase() {
      this._dbController = new zx.io.persistence.DatabaseController();
      let database = this._config.database || {};
      let config = zx.server.Config.getInstance();
      let isNewDatabase = false;
      switch (database.type || "null") {
        case "nedb":
          let dbDir = config.resolve(database.nedb?.directory || "_cms/db/nedb");
          isNewDatabase = !(await fs.exists(dbDir));

          await fs.ensureDir(dbDir);
          this._db = new zx.io.persistence.db.NedbDatabase(dbDir);
          break;

        case "mongo":
          this._db = new zx.io.persistence.db.MongoDatabase(database.mongo);
          isNewDatabase = this._db.isNewDatabase();
          break;

        default:
          throw new Error("Cannot open database because it is an unexpected type: " + (database.type || "null"));
      }

      this._dbController.addEndpoint(this._db);
      this._db.addListenerOnce("close", () => {
        let db = this._db;
        this._db = null;
        this._dbController.removeEndpoint(db);
      });
      if (database.statusFile) {
        let directory = this._config.directory || ".";
        this._dbController.setStatusFile(path.join(directory, database.statusFile));
      }
      await this._db.open();

      // Make sure that there is a Security object; if this has to be created, it will initialise
      //  default permissions etc
      await this.findOneObjectByType(zx.server.auth.Security, null, true);

      let imp = database["import"];
      if (imp) {
        let when = imp.when || "initialize";
        let doImport = false;
        if ((when === "initialize" || when === "initialise") && isNewDatabase) {
          doImport = true;
        } else if (when === "always") {
          doImport = true;
        }

        if (doImport) {
          let impDirs = imp.from || [config.resolve("_cms/db/template")];
          for (let i = 0; i < impDirs.length; i++) {
            let impDir = impDirs[i];
            let tmp = impDir + "/pages/index.json";
            let matched = qx.util.ResourceManager.getInstance().toUri(tmp);
            if (matched != tmp) {
              impDir = matched.substring(0, matched.length - 17);
            }
            let filename = zx.utils.Path.locateFile(impDir, {
              mustExist: true
            });

            await new zx.io.persistence.db.ImportExport(filename, this._db).importToDb();
          }
        }
      }
    },

    /**
     * Inits the site data from the database
     */
    async _initSite() {
      let site = (this._site = await this.getObjectByUrl(zx.cms.website.Site, "configuration/site"));
      return site;
    },

    /**
     * Returns the site configuration
     *
     * @returns {zx.cms.website.Site}
     */
    getSite() {
      return this._site;
    },

    /**
     * Inits the renderer
     */
    async _initRenderer() {
      let themeName = this._config.theme || qx.core.Environment.get("zx.cms.client.theme") || "website.myTheme";
      if (themeName.match(/[^a-z0-9-_.]/i)) {
        throw new Error(`The Theme Name must be alpha-numeric, dot or underscore characters only`);
      }
      this._renderer = this._createRenderer();
      this._renderer.set({ themeName });
      return this._renderer;
    },

    /**
     * Creates the renderer instance
     *
     * @returns {zx.cms.render.Renderer}
     */
    _createRenderer() {
      return new zx.cms.render.Renderer();
    },

    /**
     * Initialises User Discovery
     */
    async _initUserDiscovery() {
      this.__userDiscovery = this._createUserDiscovery();
      await this.__userDiscovery.initialise();
    },

    /**
     * Creates the user discovery instance
     *
     * @return {zx.server.auth.UserDiscovery  }
     */
    _createUserDiscovery() {
      return new zx.server.auth.UserDiscovery();
    },

    /**
     * Returns the user discovery instance
     *
     * @return {zx.server.auth.UserDiscovery}
     */
    getUserDiscovery() {
      return this.__userDiscovery;
    },

    /**
     * Locates a "zx.server.files.DataFile` by its well known Id
     *
     * @param {String} id
     * @returns {zx.server.files.DataFile?}
     */
    async getDataFileByWellKnownId(wellKnownId) {
      let datafile = await this.findOneObjectByType(zx.server.files.DataFile, { wellKnownId });
      return datafile;
    },

    /**
     * Returns a filename that can be used to store blobs (or any other data, EG it could be a folder)
     * based on a UUID.
     *
     * Note that parent directories may not exist
     *
     * @param {String} uuid
     * @returns {String}
     */
    getBlobFilename(uuid) {
      let blobConfig = this._config?.database?.blobs;
      if (!blobConfig || !blobConfig.directory) {
        throw new Error("Configuration does not support blobs");
      }
      let filename = path.join(this._config?.directory || ".", blobConfig.directory, zx.server.Standalone.getUuidAsPath(uuid));
      return filename;
    },

    /**
     * Loads a object
     *
     * @param {qx.Class} clazz
     * @param {String} uuid
     */
    async getObjectByUrl(clazz, url) {
      let uuid = this._objectsUrlsToId[url];
      if (uuid) {
        let object = await this._dbController.getByUuid(clazz, uuid);
        if (object) {
          return object;
        }
      }
      if (url.endsWith(".html")) {
        url = url.substring(0, url.length - 5);
      }

      let data = await this._db.findOne(clazz, { websiteName: this.getWebsiteName(), url }, { _uuid: 1 });
      uuid = (data && data._uuid) || null;
      if (!uuid) {
        return null;
      }
      let object = await this._dbController.getByUuid(clazz, uuid);
      if (object) {
        this._objectsUrlsToId[url] = uuid;
      }
      return object;
    },

    /**
     * Saves an object
     */
    async putObject(object) {
      await this._db.put(object);
    },

    /**
     * Tests whether an object of a given class and matching query exists
     *
     * @param {Class<zx.io.persistence.IObject>} clazz
     * @param {*} query
     * @returns {Boolean}
     */
    async objectExistsByType(clazz, query, create) {
      let properties = query ? qx.lang.Object.clone(query) : {};
      query = this.__createCorrectedQuery(query);

      let data = await this._db.findOne(clazz, query, { _uuid: 1 });
      let uuid = (data && data._uuid) || null;
      return !!uuid;
    },

    /**
     * Locates an object of a given class and matching a query
     *
     * @param {Class<zx.io.persistence.IObject>} clazz
     * @param {*} query
     * @param {Boolean} create whether to create the object if it does not exist
     * @returns {zx.io.persistence.IObject?} null if not found
     */
    async findOneObjectByType(clazz, query, create) {
      let properties = query ? qx.lang.Object.clone(query) : {};
      query = this.__createCorrectedQuery(query);

      let data = await this._db.findOne(clazz, query, { _uuid: 1 });
      let uuid = (data && data._uuid) || null;
      if (uuid) {
        let object = zx.io.persistence.ObjectCaches.getInstance().findObjectByUuid(uuid);
        if (!object) {
          object = await this._dbController.getByUuid(clazz, uuid);
        }
        return object;
      }

      if (create) {
        let object = new clazz().set(properties);
        await object.save();
        return object;
      }

      return null;
    },

    /**
     * Locates an object of a given class and matching a query
     *
     * @param {Class<zx.io.persistence.IObject>} clazz
     * @param {var} query
     * @param {Integer?} limit
     * @returns {zx.io.persistence.IObject[]}
     */
    async findObjectsByType(clazz, query, limit) {
      query = this.__createCorrectedQuery(query);

      let data = await this._db.find(clazz, query, { _uuid: 1 });
      let all = await data
        .limit(limit || 0)
        .map(async data => {
          let uuid = (data && data._uuid) || null;
          if (!uuid) {
            return null;
          }
          let object = zx.io.persistence.ObjectCaches.getInstance().findObjectByUuid(uuid);
          if (object) {
            return object;
          }

          object = await this._dbController.getByUuid(clazz, uuid);
          return object;
        })
        .toArray();
      all = await qx.Promise.all(all);
      all = all.filter(doc => !!doc);
      return all;
    },

    /**
     * Instantiates server objects for a collection and then re-writes them back to Mongo.
     * Useful when you've added new properties to a server object class and then want to write them to the database
     * @param {Class<zx.io.persistence.IObject>} clazz
     * @param {Object} query Mongo Query
     *
     */
    async rewriteCollection(clazz, query) {
      query = query ? this.__createCorrectedQuery(query) : null;
      let data = await this.findObjectsByType(clazz, query);
      let saveAllPromises = data.map(doc => doc.save());
      await qx.Promise.all(saveAllPromises);
    },

    /**
     * Creates a corrected version of a database query - principally, this means that `Date` objects
     * are converted into ISO strings so that range comparisons work
     *
     * @param {Map<String,Object>} query
     * @returns {Map<String,Object>} the clone
     */
    __createCorrectedQuery(query) {
      if (query === null || query === undefined) {
        return {};
      }
      if (qx.core.Environment.get("qx.debug")) {
        this.assertTrue(qx.lang.Type.isObject(query));
      }

      const scan = obj => {
        Object.getOwnPropertyNames(obj).forEach(name => {
          let value = obj[name];
          if (value) {
            if (qx.lang.Type.isDate(value)) {
              obj[name] = value.toISOString();
            } else if (qx.lang.Type.isObject(value)) {
              scan(value);
            }
          }
        });
      };

      query = qx.lang.Object.clone(query, true);
      scan(query);
      return query;
    },

    /**
     * Deletes an object from the database
     *
     * @param {zx.io.persistence.IObject} object object to delete
     */
    async deleteObject(object) {
      await this.deleteObjectsByType(object.constructor, { _uuid: object.toUuid() });
    },

    /**
     * Deletes objects of a given class and matching a query
     *
     * @param {Class<zx.io.persistence.IObject>} clazz
     * @param {*} query
     */
    async deleteObjectsByType(clazz, query) {
      query = this.__createCorrectedQuery(query);
      let properties = query ? qx.lang.Object.clone(query) : {};
      if (!query) {
        query = {};
      }

      await this._db.findAndRemove(clazz, query);
    },

    /**
     * Returns the database instance
     *
     * @return {zx.io.persistence.db.Database}
     */
    getDb() {
      if (!this._db) {
        throw new Error("Database not yet opened");
      }
      return this._db;
    },

    /**
     * Returns the object controller for the database
     *
     * @return {zx.io.persistence.DatabaseController}
     */
    getDbController() {
      return this._dbController;
    },

    /**
     * Returns the renderer
     *
     * @return {zx.cms.render.Renderer}
     */
    getRenderer() {
      return this._renderer;
    }
  },

  statics: {
    __instance: null,

    /**
     * Returns the singleton instance
     */
    getInstance() {
      return zx.server.Standalone.__instance;
    },

    /**
     * This takes a UUID and breaks it up into segments separated by path separators; the idea is that
     * we want to be able to store a bunch of files (eg blobs) based on the UUID, but if we just had
     * one directory with a million files in it, that becomes very unweildy and difficult to manage.
     *
     * The other side of the coin is that if we break it up too much and have a really deep directory
     * structure, it is equally difficult to manage because the actual files are too spread out.
     *
     * The best solution is a balance of a relatively shallow directory heirarchy, but avoiding a situation
     * where any dircetory has too many files in it
     *
     * This implementation taks a UUID like `84f41b3d-c8db-44da-b41b-3dc8dbe4da08` and transforms it
     * into `84/f4/1b3d-c8db-44da-b41b-3dc8dbe4da08`.
     *
     * @param {String} uuid the UUID to split up
     * @returns {String} the path
     */
    getUuidAsPath(uuid) {
      // 84f41b3d-c8db-44da-b41b-3dc8dbe4da08
      let filename = uuid.substring(0, 2) + path.sep + uuid.substring(2, 4) + path.sep + uuid.substring(4);
      return filename;
    }
  }
});
