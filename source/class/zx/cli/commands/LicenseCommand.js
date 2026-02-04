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

const fs = require("fs");
const path = require("path");

qx.Class.define("zx.cli.commands.LicenseCommand", {
  extend: qx.core.Object,

  construct(template, files) {
    super();
    this.__template = template;
    this.__files = files;
  },

  properties: {
    dryRun: {
      init: false,
      check: "Boolean"
    },

    replace: {
      init: false,
      check: "Boolean"
    }
  },

  members: {
    __template: null,
    __files: null,

    async run() {
      let template = await fs.promises.readFile(this.__template, "utf8");
      template = template.split("\n").map(str => str.trim());
      if (template[template.length - 1].length) {
        template.push("");
      }
      if (template[template.length - 2].length) {
        template.push("");
      }
      template = template.join("\n");

      const processFile = async filename => {
        console.info(`Processing ${filename}...`);

        let src = await fs.promises.readFile(filename, "utf8");
        let lines = src.split("\n");
        let inComment = false;
        let startComment = -1;
        let headerComment = null;
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim();
          if (!inComment) {
            if (line.startsWith("/*")) {
              inComment = true;
              startComment = i;
            } else {
              break;
            }
          }
          let pos = line.indexOf("*/");
          if (pos > -1) {
            inComment = false;
            if (pos == line.length - 2) {
              headerComment = lines.slice(startComment, i + 1).join("\n");
              src = lines.slice(i + 1).join("\n");
            }
            break;
          }
        }
        if (headerComment) {
          if (!headerComment.match(/\bcopyright\b/i) && !headerComment.match(/\blicense\b/i) && !headerComment.match(/\bauthor\b/i)) {
            src = headerComment + "\n" + src;
            headerComment = null;
          }
        }
        if (headerComment) {
          if (!this.isReplace()) {
            return;
          }
        }
        src = template + src;
        if (this.isDryRun()) {
          console.log("  (would be updated)");
        } else {
          await fs.promises.writeFile(filename, src, "utf8");
        }
      };

      const scanImpl = async filename => {
        let basename = path.basename(filename);
        let stat = await fs.promises.stat(filename);
        if (stat.isFile() && basename.match(/\.js$/)) {
          await processFile(filename);
        } else if (stat.isDirectory() && (basename == "." || basename[0] != ".")) {
          let files = await fs.promises.readdir(filename);
          for (let i = 0; i < files.length; i++) {
            let subname = path.join(filename, files[i]);
            await scanImpl(subname);
          }
        }
      };

      for (let filename of this.__files) await scanImpl(filename);

      return 0;
    }
  },

  statics: {
    createCliCommand() {
      let cmd = new zx.cli.Command("license").set({
        description: "Edits the license header on source files",
        async runFunc() {
          let { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.LicenseCommand(flags["template"], args["files"]);
          cmd.set({
            dryRun: !!flags["dry-run"],
            replace: !!flags["replace"]
          });

          return await cmd.run();
        }
      });

      cmd.addFlag(
        new zx.cli.Flag("dry-run").set({
          description: "Whether to only pretend to edit the file (outputs to stdout)",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new zx.cli.Flag("replace").set({
          description: "Replace any existing header, rather than preserve one if there already is one",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new zx.cli.Flag("template").set({
          description: "the license header template",
          required: true,
          type: "string"
        })
      );

      cmd.addArgument(
        new zx.cli.Argument("files").set({
          description: "the license header template",
          type: "string",
          required: true,
          array: true
        })
      );

      return cmd;
    }
  }
});
