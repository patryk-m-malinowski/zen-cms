/**
 * UI for managing a worker pool, displaying current and past work results.
 */
qx.Class.define("zx.server.work.ui.WorkerPoolEditor", {
  extend: qx.ui.core.Widget,
  construct() {
    super();

    this.bind(
      "selection",
      new zx.utils.Target(selection => {
        this.getQxObject("edWorkResult").setVisibility(selection ? "visible" : "excluded");
        this.getQxObject("edWorkResult").setValue(selection);
      })
    );

    this._setLayout(new qx.ui.layout.VBox(5));
    this._add(new qx.ui.basic.Label("Current Work:"));
    this._add(this.getQxObject("tblCurrentWork"), { flex: 1 });
    this._add(new qx.ui.basic.Label("Past Work:"));
    this._add(this.getQxObject("compSearchField"));
    this._add(this.getQxObject("tblPastWork"), { flex: 1 });
    this._add(this.getQxObject("edWorkResult"), { flex: 0 });

    this.bind("value.workResults", this.getQxObject("tblCurrentWork").getDataSource(), "model");
  },
  properties: {
    value: {
      check: "zx.server.work.ui.model.WorkerPool",
      nullable: true,
      event: "changeValue"
    },
    /**
     * @private
     * This property holds the currently selected work result,
     * which can either be in the past or present work table.
     */
    selection: {
      check: "zx.server.work.ui.model.WorkResult",
      nullable: true,
      event: "changeSelection"
    }
  },
  objects: {
    tblCurrentWork() {
      let tbl = new zx.server.work.ui.WorkResultsTable().set({ minHeight: 150 });

      tbl.getDatagrid().addListener("changeSelection", evt => {
        let selection = evt.getData().getItem(0) ?? null;
        if (selection) {
          this.getQxObject("tblPastWork").getDatagrid().resetSelection();
        }
        this.setSelection(selection);
      });
      return tbl;
    },

    edWorkResult() {
      return new zx.server.work.ui.WorkResultEditor().set({ visibility: "excluded" });
    },

    compSearchField() {
      let comp = new qx.ui.container.Composite(new qx.ui.layout.HBox(5));
      comp.add(this.getQxObject("searchField"), { flex: 1 });
      comp.add(this.getQxObject("btnShowStarred"));
      return comp;
    },

    btnShowStarred() {
      let btn = new qx.ui.form.ToggleButton(null, "@FontAwesome/star/16");
      return btn;
    },
    searchField() {
      let fld = new zx.ui.form.SearchField();
      fld.linkWidget(this.getQxObject("btnShowStarred"));
      fld.addListener("search", this.__refresh, this);
      return fld;
    },

    tblPastWork() {
      let tbl = new zx.server.work.ui.WorkResultsTable().set({ minHeight: 150 });
      tbl.getDatagrid().addListener("changeSelection", evt => {
        let selection = evt.getData().getItem(0) ?? null;
        if (selection) {
          this.getQxObject("tblCurrentWork").getDatagrid().resetSelection();
        }
        this.setSelection(selection);
      });
      return tbl;
    },

    edWorkResult() {
      return new zx.server.work.ui.WorkResultEditor().set({ minHeight: 600, visibility: "excluded" });
    }
  },
  members: {
    __refreshId: 0,
    async __refresh() {
      if (!this.getValue()) return;
      let id = ++this.__refreshId;
      let table = this.getQxObject("tblPastWork");
      let search = this.getQxObject("searchField").getValue();
      table.resetModel();
      let model = await this.getValue()
        .getScheduler()
        .getPastWorkResults({ text: search, pool: { id: this.getValue().getId() } });

      if (id !== this.__refreshId) {
        return;
      }
      if (this.getQxObject("btnShowStarred").getValue()) {
        let userData = zx.server.work.ui.UserData.getInstance();
        model = model.filter(item => userData.getStarredWorkResults().includes(item.toUuid()));
      }
      model.sort((a, b) => b.getStarted().getTime() - a.getStarted().getTime());
      table.setModel(new qx.data.Array(model));
    }
  }
});
