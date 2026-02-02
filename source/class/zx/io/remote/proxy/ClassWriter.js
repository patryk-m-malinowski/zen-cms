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
 * @asset(zx/io/remote/proxy/ProxyClass.tmpl)
 *
 * @typedef {{code:string,anno:Object}} AnnoExtra
 * @typedef {qx.tool.compiler.meta.StdClassParser.PropertyMeta & {annosExtra: Object.<string,AnnoExtra>}} PropertyMetaExtra
 */
qx.Class.define("zx.io.remote.proxy.ClassWriter", {
  extend: qx.core.Object,

  /**
   * Constructor
   *
   * @param {zx.io.remote.proxy.ClassesWriter} classesWriter
   * @param {string} classname
   * @param {qx.tool.compiler.meta.MetaDatabase} metaDb
   */
  construct(classesWriter, classname, metaDb) {
    super();
    this.__metaDb = metaDb;
    this.__classesWriter = classesWriter;
    this.__classname = classname;
    this._initalize();
  },

  members: {
    /**
     * @type {qx.tool.compiler.meta.MetaDatabase}
     */
    __metaDb: null,

    /** @type {zx.io.remote.proxy.ClassesWriter} containing instance */
    __classesWriter: null,

    /** @type {string} the class to create the proxy for */
    __classname: null,

    /** @type {Object.<string,PropertyMetaExtra>} properties */
    __properties: null,

    /** @type {Object.<string,MethodMeta>} methods */
    __methods: null,

    /**
     * @typedef {Object} MethodMeta
     * @property {{code:string, anno: qx.core.Object}[]=} annosExtra
     */

    /**
     * Called to read the class and initialise
     */
    _initalize() {
      const AnnoUtil = qx.tool.compiler.meta.AnnoUtil;
      let classname = this.__classname;
      let classMeta = this.__metaDb.getMetaData(classname);
      this.__properties = {};
      this.__methods = {};

      for (let [propertyName, propertyMeta] of Object.entries(classMeta.properties || {})) {
        let annosExtra = [];
        for (let [name, code] of Object.entries(propertyMeta.annotation || {})) {
          let anno = AnnoUtil.evalAnno(code);
          if (!anno) continue;
          if (!qx.Class.isSubClassOf(anno.constructor, zx.io.remote.anno.Property)) continue;
          annosExtra.push({ code, anno });
        }
        if (!annosExtra.length) continue;
        this.__properties[propertyName] = { ...propertyMeta, annosExtra };
      }

      let memberNames = Object.keys(classMeta.members || {});

      memberNames.forEach(memberName => {
        //note 2026-feb-02: we assume that the metadata does not have auto-generated property methods

        let annos = AnnoUtil.getMember(this.__metaDb, classname, memberName, zx.io.remote.anno.Method);
        if (annos.length > 0) {
          if (!this.__methods[memberName]) {
            this.__methods[memberName] = {};
          }
          this.__methods[memberName].annosExtra = annos;
        }
      });
    },

    /**
     * Creates the data used by the template
     *
     * @returns {*}
     */
    _createTemplateData() {
      const AnnoUtil = qx.tool.compiler.meta.AnnoUtil;
      let classname = this.__classname;
      let classMeta = this.__metaDb.getMetaData(classname);
      let useClasses = {};
      let requireClasses = {};

      /**
       *
       * @param {AnnoExtra[]} annosExtra
       * @returns {string}
       */
      const compileAnnos = annosExtra => `[${annosExtra.map(it => it.code).join(",")}]`;

      let it = {
        classname: classname,
        superclassname: classMeta.superClass,
        properties: Object.keys(this.__properties).map(propertyName => {
          let info = this.__properties[propertyName];
          let it = {
            name: propertyName
          };

          if (info.refine) {
            if (info.init !== undefined) {
              it.init = info.init;
            }
            it.refine = true;
            it.annoExpr = compileAnnos(info.annosExtra);
          } else {
            for (let key in info) {
              it[key] = info[key];
            }
            let upname = qx.lang.String.firstUp(propertyName);
            it.apply = "_apply" + upname;
            it.event = "change" + upname;
            it.annoExpr = compileAnnos(info.annosExtra);
          }
          return it;
        }),
        methods: Object.keys(this.__methods).map(methodName => {
          let data = this.__methods[methodName];
          let it = {
            name: methodName,
            annoExpr: data.annosExtra ? compileAnnos(data.annosExtra) : null,
            code: data.code
          };

          return it;
        })
      };

      Object.keys(this.__properties).forEach(propertyName => {
        let info = this.__properties[propertyName];
        if (info.check) {
          let classname = info.check;
          if (classname) {
            useClasses[classname] = true;
          }
        }
      });

      let anno = AnnoUtil.getOwnClass(this.__metaDb, classname, zx.io.remote.anno.Class)[0]?.anno;
      if (anno) {
        let mixins = anno.getClientMixins();
        if (mixins) {
          if (!qx.lang.Type.isArray(mixins)) {
            mixins = [mixins];
          }
          mixins = mixins.map(mixin => {
            if (typeof mixin == "string") {
              return mixin;
            }
            if (typeof mixin.classname == "string") {
              return mixin.classname;
            }
            return "" + mixin;
          });
          if (mixins.length) {
            it.mixins = mixins;
          }
        }
      }

      it.requireClasses = Object.keys(requireClasses);
      it.requireClasses.forEach(classname => delete useClasses[classname]);
      it.useClasses = Object.keys(useClasses);

      return it;
    },

    /**
     * Creates the code for the proxy class
     *
     * @return {String} the code
     */
    getProxyClassCode() {
      let fn = zx.utils.Dot.template(this.__classesWriter.getTemplate());
      let it = this._createTemplateData();
      let strResult = fn(it);
      return strResult;
    }
  }
});
