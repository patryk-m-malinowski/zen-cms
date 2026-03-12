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
 * @ignore(require)
 */

/* eslint-disable @qooxdoo/qx/no-illegal-private-usage */

const fs = zx.utils.Promisify.fs;
const path = require("upath");

/* global loadSass */
/**
 * @external(qx/tool/compiler/loadsass.js)
 * @ignore(loadSass)
 */

/**
 * Compiles a SCSS file into CSS, and supports
 *
 * @ignore(process)
 */
qx.Class.define("zx.cms.util.ScssFile", {
  extend: qx.core.Object,

  construct(theme, filename) {
    super();
    this.__theme = theme;
    this.__filename = filename;
    this.__sourceFiles = {};
    this.__importAs = {};
  },

  properties: {
    file: {
      nullable: false,
      check: "String",
      event: "changeFile"
    }
  },

  members: {
    __theme: null,
    __filename: null,
    __outputDir: null,
    __absLocations: null,
    __sourceFiles: null,
    __importAs: null,

    /**
     * Compiles the SCSS, returns a list of files that were imported)
     *
     * @param outputFilename {String} output
     * @return {String[]} dependent files
     */
    async compile(outputFilename) {
      this.__outputDir = path.dirname(outputFilename);
      this.__absLocations = {};

      let inputFileData = await this.loadSource(this.__filename);

      await new qx.Promise((resolve, reject) => {
        const sass = window.loadSass();
        sass.render(
          {
            // Always have file so that the source map knows the name of the original
            file: this.__filename,

            // data provides the contents, `file` is only used for the sourcemap filename
            data: inputFileData,

            outputStyle: "compressed",
            sourceMap: true,
            outFile: path.basename(outputFilename),

            /*
             * Importer
             */
            importer: (url, prev, done) => {
              let contents = this.__sourceFiles[url];
              if (!contents) {
                let tmp = this.__importAs[url];
                if (tmp) {
                  contents = this.__sourceFiles[tmp];
                }
              }
              return contents ? { contents } : null;
            }
          },

          (error, result) => {
            if (error) {
              this.error("Error status " + error.status + " in " + this.__filename + "[" + error.line + "," + error.column + "]: " + error.message);
              resolve(error); // NOT reject
              return;
            }

            fs.writeFileAsync(outputFilename, result.css.toString(), "utf8")
              .then(() => fs.writeFileAsync(outputFilename + ".map", result.map.toString(), "utf8"))
              .then(() => resolve(null))
              .catch(reject);
          }
        );
      });

      return Object.keys(this.__sourceFiles);
    },

    _analyseFilename(url, currentFilename) {
      let webRoot = zx.server.Config.getInstance().getRootDir();

      const findFile = filename => {
        if (fs.existsSync(filename)) {
          return filename;
        }
        let info = path.parse(filename);
        if (!info.ext) {
          filename += ".scss";
          if (fs.existsSync(filename)) {
            return filename;
          }
        } else if (info.ext != ".scss") {
          return null;
        }
        filename = path.join(info.dir, "_" + info.name + ".scss");
        if (fs.existsSync(filename)) {
          return filename;
        }
        return null;
      };

      var m = url.match(/^([a-z0-9_.]+):(\/?[^\/].*)/);
      if (m) {
        let filename = path.join(zx.server.Config.RESOURCE_DIR, m[2]);
        return {
          filename: filename,
          externalUrl: "/zx/code/resource/" + m[2]
        };
      }

      // It's a real URL like http://abc.com/..
      if (url.match(/^[a-z0-9_]+:\/\//)) {
        return {
          externalUrl: url
        };
      }

      // Explicitly a theme file
      if (url.startsWith("/zx/theme/")) {
        let relUrl = url.substring("/zx/theme/".length);
        let filename = path.resolve(this.__theme.getLocalDir(), relUrl);
        filename = findFile(filename);
        if (filename) {
          if (!filename.startsWith(path.resolve(this.__theme.getLocalDir()))) {
            this.error(`Cannot resolve ${url} because it is outside of the theme local directory`);
            return null;
          }
        } else {
          filename = path.resolve(this.__theme.getResourceDir(), relUrl);
          filename = findFile(filename);
          if (!filename) {
            return null;
          }

          if (!filename.startsWith(path.resolve(this.__theme.getResourceDir()))) {
            this.error(`Cannot resolve ${url} because it is outside of the theme resource directory`);
            return null;
          }
        }

        return {
          filename: path.relative(process.cwd(), filename),
          externalUrl: url
        };
      }

      // It's either absolute to the website (i.e. begins with a slash)
      if (url[0] == "/") {
        let filename = zx.server.Config.getInstance().resolveApp(url);
        let foundFilename = findFile(filename);
        if (foundFilename) {
          let baseDir = zx.server.Config.getInstance().resolveApp(".");
          if (!foundFilename.startsWith(baseDir)) {
            this.error(`Cannot resolve ${url} because it is outside of the web root directory`);
            return null;
          }
        }
        return {
          filename: path.relative(process.cwd(), filename),
          externalUrl: url
        };
      }

      // Must be relative to current file
      let dir = path.dirname(currentFilename);
      let filename = path.resolve(dir, url);
      filename = findFile(filename);
      if (!filename) {
        return null;
      }

      let externalUrl = null;
      if (filename.startsWith(path.resolve(this.__theme.getLocalDir()))) {
        externalUrl = "/zx/theme/" + path.relative(this.__theme.getLocalDir(), filename);
      } else if (filename.startsWith(path.resolve(this.__theme.getResourceDir()))) {
        externalUrl = "/zx/theme/" + path.relative(this.__theme.getResourceDir(), filename);
      } else if (filename.startsWith(path.resolve(webRoot))) {
        externalUrl = "/" + path.relative(webRoot, filename);
      } else if (filename.startsWith(path.resolve(zx.server.Config.RESOURCE_DIR))) {
        externalUrl = "/" + path.relative(zx.server.Config.RESOURCE_DIR, filename);
      } else {
        this.error(`Cannot resolve ${url} because it is outside of the allowed directories`);
        return null;
      }

      return {
        filename: path.relative(process.cwd(), filename),
        externalUrl: externalUrl
      };
    },

    reloadSource(filename) {
      filename = path.resolve(filename);
      delete this.__sourceFiles[filename];
      return this.loadSource(filename);
    },

    async loadSource(filename) {
      filename = path.relative(process.cwd(), filename);
      let absFilename = filename;
      if (path.extname(absFilename) == "") {
        absFilename += ".scss";
      }

      let exists = fs.existsSync(absFilename);
      if (!exists) {
        let name = path.basename(absFilename);
        if (name[0] != "_") {
          let tmp = path.join(path.dirname(absFilename), "_" + name);
          exists = fs.existsSync(tmp);
          if (exists) {
            absFilename = tmp;
          }
        }
      }
      if (!exists) {
        this.__sourceFiles[absFilename] = null;
        return null;
      }

      if (this.__sourceFiles[absFilename] !== undefined) {
        return qx.Promise.resolve(this.__sourceFiles[absFilename]);
      }

      let contents = await fs.readFileAsync(absFilename, "utf8");
      let promises = [];
      contents = contents.replace(/@import\s+["']([^;]+)["']/gi, (match, p1, offset) => {
        let pathInfo = this._analyseFilename(p1, absFilename);
        if (!pathInfo) {
          this.error(`Cannot find file to import, url=${p1} in file ${absFilename}`);
          return null;
        }
        if (pathInfo.filename) {
          promises.push(this.loadSource(pathInfo.filename));
          return '@import "' + path.relative(process.cwd(), pathInfo.filename) + '"';
        }
        if (pathInfo.externalUrl) {
          return '@import "' + pathInfo.externalUrl + '"';
        }
        return match;
      });

      contents = contents.replace(/\burl\s*\(\s*([^\)]+)*\)/gi, (match, url) => {
        let c = url[0];
        if (c === "'" || c === '"') {
          url = url.substring(1);
        }
        c = url[url.length - 1];
        if (c === "'" || c === '"') {
          url = url.substring(0, url.length - 1);
        }
        let pathInfo = this._analyseFilename(url, filename);

        if (pathInfo) {
          if (pathInfo.externalUrl) {
            return `url("${pathInfo.externalUrl}")`;
          }
        }

        return `url("${url}")`;
      });

      this.__sourceFiles[absFilename] = contents;
      this.__importAs[filename] = absFilename;

      await qx.Promise.all(promises);
      return contents;
    },

    getSourceFilenames() {
      return Object.keys(this.__sourceFiles);
    }
  }
});
