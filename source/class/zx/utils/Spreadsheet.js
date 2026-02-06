/**
 * Utility class for converting between spreadsheet column names and indices.
 */
qx.Class.define("zx.utils.Spreadsheet", {
  extend: qx.core.Object,
  type: "singleton",

  statics: {
    /**
     * Converts a spreadsheet column name (e.g. "A", "Z", "AA") to a zero-based index.
     *
     * @param {String} column
     * @returns {Integer}
     */
    toIndex(column) {
      let factor = 1;
      let total = 0;
      for (let i = column.length - 1; i >= 0; i--) {
        let ch = column.charCodeAt(i) - 65; // "A".charCodeAt(0) == 65
        if (factor == 1) {
          total += ch;
        } else {
          total += (ch + 1) * factor;
        }
        factor *= 26;
      }
      return total;
    },

    /**
     * Converts a zero-based column index to a spreadsheet column name (e.g. 0 -> "A", 25 -> "Z", 26 -> "AA").
     *
     * @param {Integer} columnIndex
     * @returns {String}
     */
    toColumn(columnIndex) {
      columnIndex++;
      let letters = "";
      while (columnIndex > 0) {
        let temp = (columnIndex - 1) % 26;
        letters = String.fromCharCode(temp + 65) + letters;
        if (columnIndex < 26) {
          break;
        }
        columnIndex = (columnIndex - temp - 1) / 26;
      }
      return letters;
    },

    /**
     * Returns an object with both column names and indices as keys, mapping to each other, for all columns from startIndex to endIndex.
     *
     * @param {Integer} endIndex
     * @param {Integer} startIndex
     * @returns {Object}
     */
    toMap(endIndex, startIndex = 0) {
      let map = {};
      for (let i = startIndex; i <= endIndex; i++) {
        let column = this.toColumn(i);
        map[column] = i;
        map[i] = column;
      }
      return map;
    }
  }
});
