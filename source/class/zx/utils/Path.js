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
 * Provides static methods for common path related functions
 *
 */

const path = require("path");
const fs = zx.utils.Promisify.fs;

qx.Class.define("zx.utils.Path", {
  extend: qx.core.Object,

  statics: {
    /**
     * Creates the parent directory of a filename, if it does not already exist
     *
     * @param {String} filename the filename to create the parent directory of
     */
    makeParentDir: async function (filename) {
      var parentDir = path.dirname(filename);
      await zx.utils.Path.makeDirs(parentDir);
    },

    /**
     * Creates a directory, if it does not exist, including all intermediate paths
     *
     * @param {String} filename the directory to create
     */
    makeDirs: async function (filename) {
      filename = path.normalize(filename);
      let segs = filename.split(path.sep);
      let made = "";
      for (let i = 0; i < segs.length; i++) {
        let seg = segs[i];
        if (made.length || !seg.length) {
          made += "/";
        }
        made += seg;
        if (!(await fs.existsAsync(made))) {
          try {
            await fs.mkdirAsync(made);
          } catch (err) {
            if (err.code !== "EEXIST") throw err;
          }
          let stat = await fs.statAsync(made);
          if (!stat.isDirectory()) {
            throw new Error(
              "Cannot create " +
                made +
                " because it exists and is not a directory",
              "ENOENT"
            );
          }
        }
      }
    },

    /**
     * Resolves a URI to a filename, where uri can be a prefix of "resource:" to get from compiled resources;
     * this also supports library namespaces, but that will generate a warning.
     *
     * @typedef LocateFileOptions
     * @property {Boolean} mustExist if true, then an error will be thrown if the file does not exist
     *
     * @param {String} uri
     * @param {LocateFileOptions} options
     * @returns
     */
    locateFile(uri, options) {
      options = options || {};

      function locateFromResources(filename) {
        filename = path.join(
          qx.util.LibraryManager.getInstance().get("qx", "resourceUri"),
          filename
        );
        if (options.mustExist) {
          let stat = fs.statSync(filename, { throwIfNoEntry: false });
          if (!stat) throw new Error(`Cannot locate the file for ${uri}`);
        }
        return filename;
      }

      if (uri.startsWith("resource:"))
        return locateFromResources(uri.substring("resource:".length));

      let pos = uri.indexOf(":");
      if (pos > -1) {
        let ns = uri.substring(0, pos);
        if (!qx.util.LibraryManager.getInstance().has(ns))
          throw new Error(
            `Cannot locate the file for ${uri} because there is no such library`
          );
        this.warn(
          "Using a library prefix to locate a resource works, but there is no such thing as library-specific prefixes any more; try using 'resource:' as a prefix"
        );
        return locateFromResources(uri.substring(pos + 1));
      }

      if (options.mustExist) {
        let stat = fs.statSync(uri, { throwIfNoEntry: false });
        if (!stat) throw new Error(`Cannot locate the file for ${uri}`);
      }

      return uri;
    },

    /**
     * Normalises the path and corrects the case of the path to match what is actually on the filing system
     *
     * @param fsPath {String} the filename to normalise
     * @returns {String} the new path
     * @async
     */
    correctCase: function (dir) {
      var drivePrefix = "";
      if (process.platform === "win32" && dir.match(/^[a-zA-Z]:/)) {
        drivePrefix = dir.substring(0, 2);
        dir = dir.substring(2);
      }
      dir = dir.replace(/\\/g, "/");
      var segs = dir.split("/");
      if (!segs.length) {
        return drivePrefix + dir;
      }

      var currentDir;
      var index;
      if (segs[0].length) {
        currentDir = "";
        index = 0;
      } else {
        currentDir = "/";
        index = 1;
      }

      function bumpToNext(nextSeg) {
        index++;
        if (currentDir.length && currentDir !== "/") {
          currentDir += "/";
        }
        currentDir += nextSeg;
        return next();
      }

      function next() {
        if (index == segs.length) {
          if (process.platform === "win32") {
            currentDir = currentDir.replace(/\//g, "\\");
          }
          return Promise.resolve(drivePrefix + currentDir);
        }

        let nextSeg = segs[index];
        if (nextSeg == "." || nextSeg == "..") {
          return bumpToNext(nextSeg);
        }

        return new Promise((resolve, reject) => {
          fs.readdir(
            currentDir.length == 0 ? "." : drivePrefix + currentDir,
            { encoding: "utf8" },
            (err, files) => {
              if (err) {
                reject(err);
                return;
              }

              let nextLowerCase = nextSeg.toLowerCase();
              let exact = false;
              let insensitive = null;
              for (let i = 0; i < files.length; i++) {
                if (files[i] === nextSeg) {
                  exact = true;
                  break;
                }
                if (files[i].toLowerCase() === nextLowerCase) {
                  insensitive = files[i];
                }
              }
              if (!exact && insensitive) {
                nextSeg = insensitive;
              }

              bumpToNext(nextSeg).then(resolve);
            }
          );
        });
      }

      return new Promise((resolve, reject) => {
        fs.stat(drivePrefix + dir, err => {
          if (err) {
            if (err.code == "ENOENT") {
              resolve(drivePrefix + dir);
            } else {
              reject(err);
            }
          } else {
            next().then(resolve);
          }
        });
      });
    }
  }
});
