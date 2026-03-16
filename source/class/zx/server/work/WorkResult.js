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

const fs = require("fs");
const path = require("path");

/**
 * WorkResult captures the Work results - status and log files; it can persist itself so that a WorkerPool can
 * store it until the Scheduler is ready to collect the results
 *
 * @typedef WorkStatus
 * @property {Date} started when the work was started
 * @property {Date?} completed when the work was completed, if it has
 * @property {string} logFile the path to the log file for the work
 *
 * @typedef WorkResultJson
 * @property {zx.server.work.IWork.WorkJson} workJson the JSON for the work, as passed to `zx.server.work.Worker.run`
 * @property {WorkStatus} workStatus the status of the work, as written to disk
 * @property {String} log the contents of the log file, as written to disk
 * @property {zx.server.work.IWorkerApi.WorkResponse} response
 *
 * @typedef WorkResultJsonMin A minified version of WorkResultJson. Does not contain the log because it can be very large.
 * @property {zx.server.work.IWork.WorkJson} workJson the JSON for the work, as passed to `zx.server.work.Worker.run`
 * @property {WorkStatus} workStatus the status of the work, as written to disk
 * @property {String} logLength the length of the log output
 * @property {zx.server.work.IWorkerApi.WorkResponse} response
 */
qx.Class.define("zx.server.work.WorkResult", {
  extend: qx.core.Object,

  construct() {
    super();
  },

  statics: {
    __DF_LOG: new qx.util.format.DateFormat("yyyy-MM-dd HH:mm:ss"),

    /**
     * Restores a WorkResult from a directory
     */
    async loadFromDir(workdir) {
      let result = new zx.server.work.WorkResult();
      result.__workdir = workdir;
      result.__workJson = await zx.utils.Json.loadJsonAsync(path.join(workdir, "work.json"));
      result.__workStatus = await zx.utils.Json.loadJsonAsync(path.join(workdir, "status.json"));
      if (!result.__workJson || !result.__workStatus) {
        qx.log.Logger.error("Error loading WorkResult from " + workdir + ": jsonWork=" + JSON.stringify(result.__workJson) + " workStatus=" + JSON.stringify(result.__workStatus));
        return null;
      }
      return result;
    },

    /**
     * Deserializes a WorkResult, as received by the Scheduler and serialized by calling `serializeForScheduler`
     */
    async deserializeFromScheduler(workdir, jsonResult) {
      let result = new zx.server.work.WorkResult();
      result.__workdir = workdir;
      result.__workJson = jsonResult.workJson;
      result.__workStatus = jsonResult.workStatus;

      await fs.promises.writeFile(path.join(workdir, "work.json"), JSON.stringify(jsonResult.workJson, null, 2));
      await fs.promises.writeFile(path.join(workdir, "status.json"), JSON.stringify(jsonResult.workStatus, null, 2));
      await fs.promises.writeFile(path.join(workdir, "log.txt"), jsonResult.log);
      return result;
    }
  },

  members: {
    /**
     * @type {zx.server.work.IWorkerApi.WorkResponse}
     */
    __response: null,

    /** @type {zx.server.work.IWork.WorkJson?} the currently running work */
    __workJson: null,

    /** @type {String} the path for storing anythign to do with the Work being run by the Worker (eg log files) */
    __workdir: null,

    /** @type {WriteStream} where to write logs for the Work */
    __logStream: null,

    /**
     * @type {String} the output of the log stream, used to capture the log output
     */
    __logOutput: null,

    /** @type {WorkStatus} JSON status that is written into the workdir */
    __workStatus: null,

    /**
     * Sets the response for the work, this is called by the Worker when it has completed the work
     * @param {zx.server.work.IWorkerApi.WorkResponse} response
     */
    setResponse(response) {
      this.__response = response;
    },

    /**
     * Called when starting the work to capture the results
     * @param {string} workdir
     * @param {zx.server.work.IWork.WorkJson} jsonWork
     */
    async initialize(workdir, jsonWork) {
      this.__workdir = workdir;
      this.__workJson = jsonWork;
      await fs.promises.mkdir(this.__workdir, { recursive: true });
      let logFilePath = path.join(this.__workdir, "log.txt");
      this.__logStream = fs.createWriteStream(logFilePath);
      this.__logOutput = "";
      await fs.promises.writeFile(path.join(this.__workdir, "work.json"), JSON.stringify(jsonWork, null, 2));
      this.__workStatus = {
        started: new Date(),
        completed: null,
        logFile: path.resolve(logFilePath)
      };
      this.appendWorkLog("Starting work: " + JSON.stringify(jsonWork, null, 2));
      this.writeStatus();
    },

    /**
     * Serializes the WorkResult ready to send back to the Scheduler
     * @returns {Promise<WorkResultJson>}
     *
     */
    serializeForScheduler() {
      return {
        workJson: this.__workJson,
        workStatus: this.__workStatus,
        log: this.__logOutput ?? "",
        response: this.__response
      };
    },

    /**
     * Called when the work is complete
     */
    async close() {
      this.__workStatus.completed = new Date();
      this.__logStream.close();
      this.__logStream = null;
      await this.writeStatus();
    },

    /**
     * The work directory
     *
     * @returns {String} the path to the work directory
     */
    getWorkDir() {
      return this.__workdir;
    },

    /**
     * Returns the JSON for the work
     *
     * @returns {zx.server.work.IWork.WorkJson} the JSON for the work
     */
    getWorkJson() {
      return this.__workJson;
    },

    /**
     * Deletes the work directory
     */
    async deleteWorkDir() {
      if (this.__workdir) {
        await fs.promises.rm(this.__workdir, { recursive: true, force: true });
        this.__workdir = null;
      }
    },

    /**
     * Appends a message to the log for the Work
     *
     * @param {String} message
     */
    appendWorkLog(message) {
      if (this.__logStream) {
        let msg = zx.server.work.WorkResult.__DF_LOG.format(new Date()) + " " + message + "\n";
        this.__logStream.write(msg);
        this.__logOutput += msg;
      }
    },

    /**
     * Returns the log file contents for the work
     */
    async getWorkLog() {
      return await fs.promises.readFile(path.join(this.__workdir, "log.txt"), "utf8");
    },

    /**
     * Persists the __workStatus to disk
     */
    async writeStatus() {
      await fs.promises.writeFile(path.join(this.__workdir, "status.json"), JSON.stringify(this.__workStatus, null, 2));
    },

    /**
     * @Override
     */
    toString() {
      return this.classname + " " + this.__workJson?.uuid + " " + this.__workdir;
    }
  }
});
