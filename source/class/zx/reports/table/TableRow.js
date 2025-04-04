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

qx.Class.define("zx.reports.table.TableRow", {
  extend: zx.reports.Block,

  members: {
    /**
     * Finds the nearest parent table
     *
     * @returns {zx.reports.table.Table?}
     */
    getTable() {
      for (let tmp = this.getParent(); tmp; tmp = tmp.getParent()) {
        if (tmp instanceof zx.reports.table.Table) {
          return tmp;
        }
      }
      throw new Error("Cannot find table");
    },

    /**
     * Returns the columns of the nearest table, or from this if it is overridden
     *
     * @returns {zx.reports.table.TableColumn[]}
     */
    getEffectiveColumns() {
      for (let tmp = this.getParent(); tmp; tmp = tmp.getParent()) {
        if (qx.Interface.classImplements(tmp.constructor, zx.reports.IHasColumns)) {
          return tmp.getColumns();
        }
      }
      throw new Error("Cannot find columns");
    },

    /**
     * @override
     */
    async _executeImpl(ds, result) {
      let tr = <tr></tr>;

      let table = this.getTable();
      this.getEffectiveColumns().forEach(column => {
        tr.add(<td>{column ? column.getDisplayValue(ds, table) : "&nbsp;"}</td>);
      });

      result.add(tr);
      await ds.next();
    }
  }
});
