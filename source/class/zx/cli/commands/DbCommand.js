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

/**
 * @use(zx.server.WebServer)
 * @use(zx.test.io.remote.RemoteWindowChildFeature)
 * @use(zx.test.io.remote.RemoteThinXhrFeature)
 */
qx.Class.define("zx.cli.commands.DbCommand", {
  extend: qx.core.Object,

  members: {
    _db: null,
    _isNewDatabase: false,

    async _openDatabase() {
      let config = await zx.server.Config.getConfig();
      let database = config.database;
      switch (database.type || "null") {
        case "nedb":
          let dbDir = zx.server.Config.getInstance().resolveData(database.nedb.directory || "_cms/db/nedb");
          this._isNewDatabase = !(await fs.exists(dbDir));

          await fs.ensureDir(dbDir);
          this._db = new zx.io.persistence.db.NedbDatabase(dbDir);
          break;

        case "mongo":
          this._db = new zx.io.persistence.db.MongoDatabase(database.mongo);
          this._isNewDatabase = this._db.isNewDatabase();
          break;

        default:
          throw new Error("Cannot open database because it is an unexpected type: " + (database.type || "null"));
      }

      await this._db.open();
    },

    async _closeDatabase() {
      await this._db.close();
      this._db = null;
    },

    async importDatabase() {
      let database = (await zx.server.Config.getConfig()).database;
      if (!database || !database["import"]) {
        this.error(`Cannot import database without \`database.import\` in the configuration`);
        return;
      }
      let imp = database["import"];

      await this._openDatabase();

      let impDirs = imp.from || [zx.server.Config.getInstance().resolveApp("_cms/db/template")];
      for (let i = 0; i < impDirs.length; i++) {
        let filename = zx.utils.Path.locateFile(impDirs[i], {
          mustExist: true
        });

        await new zx.io.persistence.db.ImportExport(filename, this._db).importToDb();
      }

      await this._closeDatabase();

      return null;
    }
  },

  statics: {
    createCliCommand() {
      let cmd = new zx.cli.Command("db").set({
        description: "Database admin commands"
      });

      let sub = new zx.cli.Command("import").set({
        description: `Imports the database from template`,
        async runFunc() {
          const { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.DbCommand();
          return await cmd.importDatabase();
        }
      });

      cmd.addSubcommand(sub);

      return cmd;
    }
  }
});
