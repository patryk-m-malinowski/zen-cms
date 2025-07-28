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
 */
qx.Class.define("zx.io.remote.proxy.ClassWriter", {
  extend: qx.core.Object,

  /**
   * Constructor
   *
   * @param {zx.io.remote.proxy.ClassesWriter} classesWriter
   * @param {Class} clazz
   */
  construct(classesWriter, clazz) {
    super();
    this.__classesWriter = classesWriter;
    this.__clazz = clazz;
    this._initalise();
  },

  members: {
    /** @type{zx.io.remote.proxy.ClassesWriter} containing instance */
    __classesWriter: null,

    /** @type{Class} the class to create the proxy for */
    __clazz: null,

    /** @type{Map} properties */
    __properties: null,

    /** @type{Map} methods */
    __methods: null,

    /**
     * Called to read the class and initialise
     */
    _initalise() {
      let clazz = this.__clazz;
      this.__properties = {};
      this.__methods = {};

      let properties = qx.util.PropertyUtil.getProperties(clazz);
      if (properties) {
        const getPropertyDefinition = (clazz, propertyName) => {
          let info = qx.util.PropertyUtil.getProperty(clazz, propertyName).getDefinition();
          info = qx.lang.Object.clone(info);
          if (info["@"] && !qx.lang.Type.isArray(info["@"])) {
            info["@"] = [info["@"]];
          }
          return info;
        };

        for (let propertyName in properties) {
          let info = getPropertyDefinition(clazz, propertyName);
          let allAnnos = info["@"] || [];

          let annos = allAnnos.filter(anno => qx.Class.isSubClassOf(anno.constructor, zx.io.persistence.anno.Array));
          let arrayType = null;
          if (annos.length) {
            arrayType = info.arrayType = annos[annos.length - 1].getArrayType();
          }

          annos = allAnnos.filter(anno => qx.Class.isSubClassOf(anno.constructor, zx.io.persistence.anno.Map));
          let keyType = null;
          if (annos.length) {
            let anno = annos[annos.length - 1];
            arrayType = info.arrayType = anno.getArrayType();
            keyType = info.keyType = anno.getKeyType();
          }

          annos = allAnnos.filter(anno => qx.Class.isSubClassOf(anno.constructor, zx.io.remote.anno.Property));
          if (!annos.length) {
            continue;
          }

          let refType = null;
          if (info.check) {
            if (info.check === "Array") {
              refType = arrayType;
            } else if (typeof info.check != "string") {
              if (qx.Class.isSubClassOf(info.check, qx.data.Array)) {
                refType = arrayType;
              } else if (qx.Class.isSubClassOf(info.check, qx.data.Array)) {
                refType = arrayType;
              } else if (qx.Class.isSubClassOf(info.check, qx.core.Object)) {
                refType = info.check;
              } else {
                delete info.check;
              }
            }
          }

          info.$remote = { annos, refType, keyType };
          if (info.transform && !annos[annos.length - 1].isExcludeTransform()) {
            info.$remote.transform = info.transform;
            this.__methods[info.transform] = {
              code: clazz.prototype[info.transform].toString()
            };
          }
          this.__properties[propertyName] = info;
        }
      }

      const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const PROPERTY_PREFIXES = {
        get: true,
        set: true,
        init: true,
        reset: true
      };

      let names = Object.keys(clazz.prototype).filter(v => typeof clazz.prototype[v] == "function" && v != "constructor" && v != "destruct");
      names.forEach(name => {
        // Exclude any methods which are property accessors
        let pos = -1;
        for (let i = 0; i < name.length; i++) {
          if (UPPER.indexOf(name[i]) > -1) {
            pos = i;
            break;
          }
        }
        if (pos > -1) {
          let prefix = name.substring(0, pos);
          if (PROPERTY_PREFIXES[prefix]) {
            let propertyName = qx.lang.String.firstLow(name.substring(pos));
            if (properties && properties[propertyName]) {
              return false;
            }
          }
        }

        // And then filter by the annotations
        let annos = qx.Annotation.getMember(clazz, name, zx.io.remote.anno.Method);
        if (annos.length > 0) {
          if (!this.__methods[name]) {
            this.__methods[name] = {};
          }
          this.__methods[name].annos = annos;
        }
      });
    },

    /**
     * Creates the data used by the template
     *
     * @returns {*}
     */
    _createTemplateData() {
      let clazz = this.__clazz;
      let useClasses = {};
      let requireClasses = {};

      const compileAnnos = annos => {
        annos = annos.map(anno => {
          let str = `new ${anno.classname}()`;
          let props = [];
          qx.Class.getProperties(anno.constructor).forEach(name => {
            let upname = qx.lang.String.firstUp(name);
            let def = qx.Class.getPropertyDefinition(anno.constructor, name);
            let value = anno["get" + upname]();
            if (def.init !== value) {
              if (typeof value.classname == "string" && qx.Class.getByName(value.classname) === value) {
                props.push('"' + name + '": ' + value.classname);
              } else {
                props.push('"' + name + '": ' + JSON.stringify(value));
              }
            }
          });
          if (props.length) {
            str += ".set({ " + props.join(", ") + " })";
          }
          requireClasses[anno.classname] = true;
          return str;
        });
        return "[" + annos.join(", ") + "]";
      };

      let it = {
        classname: clazz.classname,
        superclassname: clazz.superclass.classname,
        properties: Object.keys(this.__properties).map(propertyName => {
          let info = this.__properties[propertyName];
          let it = {
            name: propertyName
          };

          if (info.refine || info.refined) {
            if (info.init !== undefined) {
              it.init = info.init;
            }
            it.refine = true;
            it.annoExpr = compileAnnos(info["@"]);
          } else {
            for (let key in info) {
              it[key] = info[key];
            }
            if (info.refined) {
              it.refine = true;
            }
            let upname = qx.lang.String.firstUp(propertyName);
            it.apply = "_apply" + upname;
            it.event = "change" + upname;
            it.annoExpr = compileAnnos(info["@"]);
          }
          return it;
        }),
        methods: Object.keys(this.__methods).map(methodName => {
          let data = this.__methods[methodName];
          let it = {
            name: methodName,
            annoExpr: data.annos ? compileAnnos(data.annos) : null,
            code: data.code
          };

          return it;
        })
      };

      Object.keys(this.__properties).forEach(propertyName => {
        let info = this.__properties[propertyName];
        if (info.check) {
          let clazz = qx.Class.getByName(info.check);
          if (clazz) {
            useClasses[clazz.classname] = true;
          }
        }
      });

      let anno = qx.Annotation.getOwnClass(clazz, zx.io.remote.anno.Class)[0] || null;
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
    async getProxyClassCode() {
      let strTemplate = await this.__classesWriter.loadTemplate("zx/io/remote/proxy/ProxyClass.tmpl");
      let fn = zx.utils.Dot.template(strTemplate);
      let it = this._createTemplateData();
      let strResult = fn(it);
      return strResult;
    }
  }
});
