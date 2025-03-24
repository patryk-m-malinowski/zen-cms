/**
 * Provides a simple datasource that accesses a remote zx.reports.server.Cursor
 */
qx.Class.define("zx.reports.datasource.CursorDataSource", {
  extend: zx.reports.datasource.AbstractDataSource,

  /**
   * Constructor
   *
   * @param {zx.reports.server.Cursor} cursor
   */
  construct(cursor) {
    super();
    this.__cursor = cursor;
  },

  members: {
    /** @type{zx.reports.server.Cursor} remote cursor */
    __cursor: null,

    /** @type{Object} the current row object */
    __data: undefined,

    /**
     * @Override
     */
    async _nextImpl() {
      if (this.__data === null) {
        return false;
      }

      this.__data = await this.__cursor.next();
      return this.__data !== null;
    },

    getRowData() {
      return this.__data;
    },

    /**
     * @Override
     */
    get(columnName) {
      if (this.__data === null) {
        return null;
      }
      return this.__data[columnName];
    },

    /**
     * @Override
     */
    getColumnNames() {
      return Object.keys(this.__data);
    }
  }
});
