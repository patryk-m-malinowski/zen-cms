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

qx.Class.define("zx.reports.accumulators.SumAccumulator", {
  extend: qx.core.Object,
  implement: [zx.reports.accumulators.IAccumulator],

  construct(columnName) {
    super();
    this.__columnName = columnName;
  },

  properties: {
    sum: {
      init: 0,
      check: "Integer",
      event: "changeSum"
    }
  },

  members: {
    /** @type{String} the name of the column to count*/
    __columnName: null,

    /**
     * @override
     */
    reset(ds) {
      this.setSum(0);
    },

    /**
     * @override
     */
    update(ds) {
      let value = ds.get(this.__columnName);
      try {
        value = parseInt(value, 10) || 0;
      } catch (ex) {
        return;
      }
      this.setSum(this.getSum() + value);
    }
  }
});
