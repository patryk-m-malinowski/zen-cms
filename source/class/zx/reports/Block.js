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
 * A Block outputs a horizontal chunk of data, including the output of any before and after blocks
 *
 */
qx.Class.define("zx.reports.Block", {
  extend: qx.core.Object,

  construct(fnOnRow) {
    super();
    this.__fnOnRow = fnOnRow;
  },

  properties: {
    /** Optional parent block - do not set this manually */
    parent: {
      init: null,
      nullable: true,
      check: "zx.reports.Block"
    },

    /** Block executed before the content */
    before: {
      init: null,
      nullable: true,
      check: "zx.reports.Block"
    },

    /** Block executed after the content */
    after: {
      init: null,
      nullable: true,
      check: "zx.reports.Block"
    }
  },

  members: {
    __fnOnRow: null,

    /**
     * Creates the output for before the row
     *
     * @param {*} row the current row from the datasource
     */
    async executeBefore(row) {
      let before = this.getBefore();
      return await this._render(before, row);
    },

    /**
     * Creates the output for after the row
     *
     * @param {*} row the current row from the datasource
     */
    async executeAfter(row) {
      let after = this.getAfter();
      return await this._render(after, row);
    },

    /**
     * Creates the output for the row
     *
     * @param {*} row the current row from the datasource
     */
    async executeRow(row) {
      if (!this.__fnOnRow) {
        throw new Error(`No onRow function defined for ${this.classname}`);
      }
      return await this._render(await this.__fnOnRow(row), row);
    },

    /**
     * Provides the an opportunity to wrap the content for a row
     *
     * @param {*} row the current row from the datasource
     * @param {qx.html.Element[]} content the content previously compiled for this group for the row
     * @returns
     */
    async executeWrap(row, content) {
      return content;
    },

    /**
     * Helper method that renders a block, depending on what it is.  Does nothing if block is null
     *
     * @param {zx.reports.Block|qx.html.Element?} block the block to render
     * @param {row} the current row from the datasource
     * @return {qx.html.Element?} the result
     */
    async _render(block, row) {
      if (!block) {
        return null;
      }

      if (block instanceof qx.html.Node) {
        return block;
      } else if (block instanceof zx.reports.Block) {
        return await block.executeRow(row);
      } else {
        throw new Error(`Unknown type of block: ${block.classname}`);
      }
    }
  }
});
