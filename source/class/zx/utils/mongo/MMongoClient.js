/**
 * @typedef {{
 *   from: string;
 *   as: string;
 *   localField: string;
 *   foreignField?: string;
 * } | {
 *   from: string;
 *   as: string;
 *   let?: Record<string, any>;
 *   pipeline: any[];
 * } | {
 *   from: string;
 *   as: string;
 *   localField: string;
 *   foreignField?: string;
 *   let?: Record<string, any>;
 *   pipeline: any[];
 * }} $lookup
 *
 * @typedef {import("mongodb").Document} MongoDocument
 */
qx.Mixin.define("zx.utils.mongo.MMongoClient", {
  properties: {
    enableDebug: {
      init: false,
      check: "Boolean"
    }
  },

  statics: {
    /**
     * Unescapes a map key, e.g. `\\u002e` to `.`
     *
     * @param {String} key
     * @returns {String}
     */
    unescapeMapKey(key) {
      return key.replace(/\\u002e/g, ".");
    },

    /**
     * Removes escaping from a JSON object, e.g. `\\u002e` to `.`  This is used where map keys have dots in them, which
     * breaks MongoDB so we've escaped them in the Java writer.  We need to unescape them before using them in code.
     *
     * @param {*} json
     * @returns {*}
     */
    unescapeMapKeys(json) {
      if (json && qx.lang.Type.isObject(json) && !qx.lang.Type.isArray(json)) {
        let result = {};
        for (let key in json) {
          let unescapedKey = zx.utils.mongo.MMongoClient.unescapeMapKey(key);
          result[unescapedKey] = zx.utils.mongo.MMongoClient.unescapeMapKeys(json[key]);
        }
        return result;
      }
      return json;
    }
  },

  members: {
    /**
     * Outputs mongo query details if `debug` is true
     *
     * @param {String|qx.Class} clazz
     * @param {*} args
     */
    _debugMongo(clazz, ...args) {
      if (this.getEnableDebug()) {
        this.debug("Mongo: " + clazz + " " + args.map(arg => JSON.stringify(arg)).join(", "));
      }
    },

    /**
     * Simple wrapper for database `find` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @param {Object} options
     * @returns {import("mongodb").FindCursor}
     */
    find(clazz, query, options) {
      this._debugMongo(clazz, query);
      return zx.server.Standalone.getInstance().getDb().getCollection(clazz).find(query, options);
    },

    /**
     * Simple wrapper to test whether any rows exist for a query
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @returns {Promise<Boolean>}
     */
    async existsAny(clazz, query) {
      this._debugMongo(clazz, query);
      let cursor = await zx.server.Standalone.getInstance().getDb().find(clazz, query);
      let exists = await cursor.hasNext();
      await cursor.close();
      return exists;
    },

    /**
     * Simple wrapper for database `find` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @returns {Promise<import("mongodb").WithId<unknown>>}
     */
    async findOne(clazz, query, ...args) {
      this._debugMongo(clazz, query);
      if (typeof clazz !== "string") {
        clazz = clazz.classname;
      }
      let result = await zx.server.Standalone.getInstance()
        .getDb()
        .getCollection(clazz)
        .findOne(query, ...args);

      return this.unescapeMapKeys(result);
    },

    /**
     * Simple wrapper for database `insertOne` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {MongoDocument} row
     * @returns {Promise<import("mongodb").InsertOneResult>}
     */
    async insertOne(clazz, row) {
      this._debugMongo(clazz, row);
      /**@type {import("mongodb").Collection}*/
      let collection = await zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return await collection.insertOne(row);
    },

    /**
     * Simple wrapper for database `insertMany` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {MongoDocument[]} rows
     * @returns {Promise<import("mongodb").InsertManyResult>}
     */
    async insertMany(clazz, rows) {
      this._debugMongo(clazz, rows);
      /**@type {import("mongodb").Collection}*/
      let collection = await zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return await collection.insertMany(rows);
    },

    /**
     * Simple wrapper for database `deleteOne` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @returns {Promise<import("mongodb").DeleteResult>}
     */
    async deleteOne(clazz, query) {
      this._debugMongo(clazz, query);
      /**@type {import("mongodb").Collection}*/
      let collection = await zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return await collection.deleteOne(query);
    },

    /**
     * Simple wrapper for database `deleteMany` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @returns {Promise<import("mongodb").DeleteResult>}
     */
    async deleteMany(clazz, query) {
      this._debugMongo(clazz, query);
      /**@type {import("mongodb").Collection}*/
      let collection = await zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return await collection.deleteMany(query);
    },

    /**
     * Simple wrapper for database `aggregate` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {MongoDocument[]} query
     * @returns {import("mongodb").AggregationCursor}
     */
    aggregate(clazz, query) {
      this._debugMongo(clazz, query);
      /**@type {import("mongodb").Collection}*/
      let collection = zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return collection.aggregate(query);
    },

    /**
     * Simple wrapper for database `aggregate` which enforces zero or one results, with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {MongoDocument[]} query
     * @returns {Promise<import("mongodb").Document>}
     */
    async aggregateOne(clazz, query) {
      this._debugMongo(clazz, query);
      /**@type {import("mongodb").Collection}*/
      let collection = zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      let cursor = await collection.aggregate(query);
      if (!(await cursor.hasNext())) {
        return null;
      }
      let result = await cursor.next();
      if (await cursor.hasNext()) {
        throw new Error("More than one document found");
      }
      return result;
    },

    /**
     * Simple wrapper for database `updateOne` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @param {import("mongodb").UpdateFilter<MongoDocument>|Partial<MongoDocument>} update
     * @returns {Promise<import("mongodb").UpdateResult>}
     */
    async updateOne(clazz, query, update) {
      this._debugMongo(clazz, query, update);
      /**@type {import("mongodb").Collection}*/
      let collection = zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return await collection.updateOne(query, update);
    },

    /**
     * Simple wrapper for database `updateMany` with debug output
     *
     * @param {String|qx.Class} clazz
     * @param {import("mongodb").Filter<MongoDocument>} query
     * @param {import("mongodb").UpdateFilter<MongoDocument>|Partial<MongoDocument>} update
     * @returns {Promise<import("mongodb").UpdateResult>}
     */
    async updateMany(clazz, query, update) {
      this._debugMongo(clazz, query, update);
      /**@type {import("mongodb").Collection}*/
      let collection = zx.server.Standalone.getInstance().getDb().getCollection(clazz);
      return await collection.updateMany(query, update);
    },

    unescapeMapKeys(json) {
      return zx.utils.mongo.MMongoClient.unescapeMapKeys(json);
    },

    /**
     * Shorthand for `set( field = first( field ) )`
     *
     * @example
     * ```js
     * collection.aggregate([
     *   uk.co.spar.services.MongoUtil.setToFirst("$someField"),
     * ]);
     * ```
     *
     * @param {string} name The name of the array field to set to it's first item
     * @return {Object}
     */
    setToFirst(name) {
      return {
        $set: { [name]: { $first: `$${name}` } }
      };
    },

    /**
     * Shorthand for `lookup( field = ... ), set( field = first( field ) )`
     *
     * @example
     * ```js
     * collection.aggregate([
     *   ...zx.utils.mongo.MongoHelpers.lookupFirst({ from: "otherCollection", localField: "thing.id", foreignField: "_id", as: "field" }),
     *   ...zx.utils.mongo.MongoHelpers.lookupFirst({
     *     // from: defaults to "documents"
     *     localField: "thing.id",
     *     // foreignField: defaults to "_uuid"
     *     as: "field"
     *   }),
     *   ...zx.utils.mongo.MongoHelpers.lookupFirst({
     *     from: "otherCollection",
     *     let: { thingId: "$thing.id" },
     *     pipeline: [{ $match: { $expr: { $eq: ["$$thingId", "$_id"] } } }],
     *     as: "field"
     *   }),
     * ]);
     * ```
     *
     * @param {$lookup} lookup The lookup to perform. `.foreignField` defaults to `"_uuid"`
     * @returns {Object[]}
     */
    lookupFirst(lookup) {
      if (!lookup.from) {
        throw new Error("lookupFirst: `from` must be specified");
      }
      if (!lookup.as) {
        throw new Error("lookupFirst: `as` must be specified");
      }
      if ("localField" in lookup) {
        lookup.foreignField ??= "_uuid";
      }
      return [
        {
          $lookup: lookup
        },
        zx.utils.mongo.MongoHelpers.setToFirst(lookup.as)
      ];
    },

    /**
     * Partial, case insensitive match
     */
    partialMatch(query) {
      return { $regex: query, $options: "i" };
    },

    /**
     * Case insensitive match
     */
    insensitiveMatch(query) {
      return { $regex: "^" + query + "$", $options: "i" };
    }
  }
});
