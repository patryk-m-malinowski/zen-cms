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

qx.Class.define("zx.io.remote.proxy.ClassesWriter", {
  extend: qx.core.Object,
  implement: [qx.tool.compiler.ISourceTransformer],

  properties: {
    verbose: {
      init: false,
      check: "Boolean"
    }
  },

  members: {
    /**
     * @type {qx.tool.compiler.meta.MetaDatabase}
     */
    __metaDb: null,
    /**
     * @type {string}
     * The dot template for generating proxy classes
     */
    __template: "",

    /**
     *
     * @param {qx.tool.compiler.meta.MetaDatabase} metaDb
     */
    async init(metaDb) {
      this.__metaDb = metaDb;
      let fname = qx.util.ResourceManager.getInstance().toUri("zx/io/remote/proxy/ProxyClass.tmpl");
      this.__template = await fs.promises.readFile(fname, "utf8");
    },

    /**
     *
     * @returns {string}
     */
    getTemplate() {
      return this.__template;
    },

    /**
     * @override interface qx.tool.compiler.ISourceTransformer
     * @param {qx.tool.compiler.Controller.SourceInfo} sourceInfo
     */
    shouldTransform(sourceInfo) {
      return this.shouldBeProxied(sourceInfo.classname);
    },

    /**
     * @param {string} classname
     * @returns {boolean} Whether this class should be proxied
     */
    shouldBeProxied(classname) {
      let meta = this.__metaDb.getMetaData(classname);

      /**
       *
       * @param {string} classname
       * @returns {string[]}
       */
      const getInterfacesFlat = classname => {
        let queue = [classname];
        let out = [];
        while (queue.length > 0) {
          let current = queue.shift();
          let meta = this.__metaDb.getMetaData(current);
          if (!meta) {
            continue;
          }
          if (meta.type === "interface") {
            out.push(current);
          }
          let implements = meta.interfaces || [];
          queue.push(...implements);
          if (meta.type === "class" && meta.superClass) {
            queue.push(meta.superClass);
          }
        }
        return out;
      };

      let interfaces = getInterfacesFlat(classname);
      if (!interfaces.includes("zx.io.remote.IProxied")) {
        return false;
      }

      const AnnoUtil = qx.tool.compiler.meta.AnnoUtil;
      let annotations = meta.annotation?.map(AnnoUtil.evalAnno);
      if (annotations) {
        for (let anno of annotations) {
          if (anno instanceof zx.io.remote.anno.Class) {
            if (anno.getProxy() == "never") {
              return false;
            }
          }
        }
      }
      return true;
    },

    /**@override interface qx.tool.compiler.ISourceTransformer */
    transform(sourceInfo) {
      return this.generateProxy(sourceInfo.classname);
    },

    /**
     *
     * @param {string} classname
     * @returns {string} The resulting source
     */
    generateProxy(classname) {
      let writer = new zx.io.remote.proxy.ClassWriter(this, classname, this.__metaDb);
      let str = writer.getProxyClassCode();
      return str;
    }
  }
});
