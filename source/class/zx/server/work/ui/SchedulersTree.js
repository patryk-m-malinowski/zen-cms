qx.Class.define("zx.server.work.ui.SchedulersTree", {
  extend: qx.ui.core.Widget,

  construct() {
    super();

    let inspector = new zx.server.work.ui.NodeInspector();
    let root = new zx.server.work.ui.model.ListOfSchedulers();
    this.__dataSource = new qxl.datagrid.source.tree.TreeDataSource(() => inspector, this.getQxObject("columns")).set({ root });

    this._setLayout(new qx.ui.layout.Grow());
    this._add(this.getQxObject("datagrid"));
  },
  objects: {
    datagrid() {
      let grid = new qxl.datagrid.ClippedScrollDataGrid(this.getQxObject("columns")).set({ dataSource: this.__dataSource });
      grid.getStyling().set({ numHeaderRows: 0 });
      grid.bind(
        "selection[0]",
        new zx.utils.Target(selection => {
          if (selection && selection instanceof zx.server.work.ui.model.WorkerPool) {
            selection.getChildren(); //this will make it load all the information about worker trackers and their work results
            //otherwise we would't be getting anything showing in the worker pool editor
          }
        })
      );
      return grid;
    },

    columns() {
      let columns = new qxl.datagrid.column.Columns();
      columns.add(
        new qxl.datagrid.column.tree.ExpansionColumn().set({
          path: "title",
          minWidth: 400
        })
      );
      return columns;
    }
  },
  members: {
    /**
     * @type {qxl.datagrid.source.tree.TreeDataSource}
     */
    __dataSource: null,
    /**
     *
     * @returns {qxl.datagrid.DataGrid}
     */
    getDatagrid() {
      return this.getQxObject("datagrid");
    }
  }
});
