qx.Class.define("zx.test.util.Spreadsheet", {
  extend: qx.dev.unit.TestCase,

  members: {
    testColumns() {
      let columns = [];
      for (let i = 0; i < 1000; i++) {
        let column = zx.utils.Spreadsheet.toColumn(i);
        let index = zx.utils.Spreadsheet.toIndex(column);
        this.assertEquals(i, index, `Expected ${i} but got ${index} for column ${column}`);
        let str = column.padStart(5, " ");
        columns.push(str);
      }
      let index = 0;
      for (let i = 0; i < columns.length; i++) {
        let column = columns[i];
        let char = column.charCodeAt(column.length - 1) - 65;
        this.assertEquals(index, char, `Expected ${index} but got ${char} for column #${i}: ${column}`);
        if (index === 25) {
          index = 0;
        } else {
          index++;
        }
      }
    }
  }
});
