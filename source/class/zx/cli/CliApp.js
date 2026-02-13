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
const { isMainThread, workerData } = require("node:worker_threads");

/**
 * @use(zx.cli.GetCommand)
 * @use(zx.cli.ServeCommand)
 * @use(zx.cli.UserCommand)
 * @use(zx.test.cli.TestCommand)
 * @use(zx.utils.Readline)
 * @use(zx.server.work.runtime.NodeWorkerService)
 * @asset(zx/cli/*)
 */
qx.Class.define("zx.cli.CliApp", {
  extend: qx.application.Basic,

  construct() {
    super();
    this.__apis = {};
  },

  members: {
    /** @type{Object<String,qx.core.Object>} map of APIs, indexed by api name */
    __apis: null,

    /**
     * @Override
     */
    async main() {
      qx.log.Logger.register(zx.utils.NativeLogger);
      qx.log.appender.Formatter.getFormatter().setFormatTimeAs("datetime");
      await zx.utils.LogFilter.loadFiltersAutoDetect();

      /*
      if (qx.core.Environment.get("qx.debug")) {
        zx.test.TestRunner.runAll(zx.test.cli.TestCli);
      }
      */

      if (isMainThread) {
        await this.runCli();
      } else {
        await this.runWorkerThread();
      }
    },

    /**
     * Called to run the command line
     */
    async runCli() {
      let rootCmd = this._createRootCommand();
      try {
        await rootCmd.execute();
      } catch (ex) {
        console.error(ex);
        process.exit(1);
      }
    },

    /**
     * Called to run from a worker thread
     */
    async runWorkerThread() {
      let clazz = workerData.classname ? qx.Class.getByName(workerData.classname) : null;
      if (!clazz) {
        throw new Error("Cannot create a class for Worker, workerData=" + JSON.stringify(workerData));
      }
      let service = new clazz(workerData);
      await service.run();
    },

    /**
     * Creates the command for parsing the command line
     *
     * @returns {zx.cli.Command}
     */
    _createRootCommand() {
      let rootCmd = new zx.cli.Command("*");
      rootCmd.addSubcommand(new zx.cli.commands.ServeCommand());
      rootCmd.addSubcommand(zx.cli.commands.DbCommand.createCliCommand());
      rootCmd.addSubcommand(zx.cli.commands.GetCommand.createCliCommand());
      rootCmd.addSubcommand(zx.cli.commands.UserCommand.createCliCommand());
      rootCmd.addSubcommand(zx.test.cli.TestCommand.createCliCommand());
      rootCmd.addSubcommand(zx.cli.commands.ShortenCommand.createCliCommand());
      rootCmd.addSubcommand(zx.cli.commands.LicenseCommand.createCliCommand());
      rootCmd.addSubcommand(new zx.server.email.commands.EmailCommand());
      rootCmd.addSubcommand(new zx.cli.commands.WorkCommand());
      if (qx.core.Environment.get("qx.debug")) {
        rootCmd.addSubcommand(new zx.cli.commands.DemoCommand());
      }
      return rootCmd;
    },

    /**
     * Gets a named API, intended to be compatible with `zx.thin.ThinClientApp.getApi`
     *
     * @param {String} apiName
     * @returns {qx.core.Object}
     */
    async getApi(apiName) {
      let api = this.__apis[apiName];
      if (!api) {
        let clazz;
        if (typeof apiName == "string") {
          clazz = qx.Class.getByName(apiName);
          if (!clazz) {
            throw new Error("Cannot find API " + apiName);
          }
        } else {
          clazz = apiName;
        }
        api = new clazz();
        this.__apis[apiName] = api;
      }
      return api;
    }
  }
});
