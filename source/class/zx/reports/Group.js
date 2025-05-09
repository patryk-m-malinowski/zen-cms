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

/**
 * Specialisation of block that updates accumulators on each change of group
 */
qx.Class.define("zx.reports.Group", {
  extend: zx.reports.Block,

  /**
   * Constructor
   */
  construct(titleAccessor) {
    super();
    this.__accumulators = {};
    if (titleAccessor) {
      this.setTitleAccessor(titleAccessor);
    }
  },

  properties: {
    /** How to get the title; either a path or a function that is called with the row from datasource as a parameter.
     * Defaults to `${valueAccessor}.title`, or just `title` if `valueAccessor` is null
     * @type {String|Function}
     */
    titleAccessor: {
      init: null,
      nullable: true
    },

    /** How to get the value's uuid; either a path or a function that is called with the row from datasource as a parameter
     * Defaults to `${valueAccessor}._uuid`, or just `_uuid` if `valueAccessor` is null
     * @type {String|Function}
     */
    valueUuidAccessor: {
      init: null,
      nullable: true
    },

    /** How to get the value used for sorting; either a path or a function that is called with the row from datasource as a
     * parameter.  If null, this defaults to the title
     * @type {String|Function}
     */
    valueAccessor: {
      init: null,
      nullable: true
    },

    /** How to sort the group; can be null, "asc", "desc", or a comparison function */
    sortMethod: {
      init: "asc",
      check: "Function"
    },

    /** How to get the extra data; either a path or a function that is called with the row from datasource as a parameter
     *
     * @type {String|Function}
     */
    extraDataAccessor: {
      init: null,
      nullable: true
    },

    /** The each which is executed for every row in this group */
    each: {
      init: null,
      nullable: true,
      check: "zx.reports.Block",
      apply: "_applyEach"
    },

    /** Whether this group supports drill down */
    drillable: {
      init: false,
      check: "Boolean",
      event: "changeDrillable"
    },

    /** The meta data for this group; can be a literal value or a Function to call */
    meta: {
      init: null,
      nullable: true,
      event: "changeMeta"
    }
  },

  members: {
    /** @type{String[]} Column names to group by */
    __fieldNames: null,

    /** @type{Map<String,zx.reports.Accumulator>} accumulators */
    __accumulators: null,

    /**
     * Apply for `each`
     */
    _applyEach(value, oldValue) {
      if (oldValue) {
        if (oldValue.getParent() !== this) {
          throw new Error("Each has wrong parent");
        }
        oldValue.setParent(null);
      }
      if (value) {
        if (value.getParent() !== null) {
          throw new Error("Each has a parent already");
        }
        value.setParent(this);
      }
    },

    /**
     * Adds an accumulator
     *
     * @param {String} id
     * @param {zx.reports.Accumulator} acc
     */
    addAccumulator(id, acc) {
      this.__accumulators[id] = acc;
    },

    /**
     * Sets the accumulators in one go
     *
     * @param {zx.reports.Accumulator[]} accs
     */
    setAccumulators(accs) {
      this.__accumulators = {};
      for (let id in accs) {
        this.__accumulators[id] = accs[id];
      }
    },

    /**
     * @override
     */
    getAccumulator(id) {
      let acc = this.__accumulators[id];
      return acc;
    },

    /**
     * @override
     */
    async executeBefore(row) {
      return await super.executeBefore(row);
    },

    resetAccumulators(row) {
      for (let id in this.__accumulators) {
        this.__accumulators[id].reset();
      }
    },

    /**
     * @override
     */
    async executeAsCsvBefore(row) {
      for (let id in this.__accumulators) {
        this.__accumulators[id].reset();
      }
      return await super.executeAsCsvBefore(row);
    },

    /**
     * @override
     */
    async executeRow(row) {
      this.__updateAccumulatorsToRoot(row);
      let each = this.getEach();
      if (each) {
        return await each.executeRow(row);
      }
      return [];
    },

    __updateAccumulatorsToRoot(row) {
      for (let id in this.__accumulators) {
        this.__accumulators[id].update(row);
      }
      this.getParent()?.__updateAccumulatorsToRoot(row);
    },

    /**
     * @override
     */
    async executeAsCsvRow(row) {
      for (let id in this.__accumulators) {
        this.__accumulators[id].update(row);
      }
      let each = this.getEach();
      if (each) {
        return await each.executeAsCsvRow(row);
      }
      return await super.executeAsCsvRow(row);
    }
  }
});
