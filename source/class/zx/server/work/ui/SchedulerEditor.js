/**
 * UI for a managing a work scheduler.
 */
qx.Class.define("zx.server.work.ui.SchedulerEditor", {
  extend: qx.ui.core.Widget,
  construct() {
    super();

    this.getQxObject("tblPastWork")
      .getDatagrid()
      .bind(
        "selection[0]",
        new zx.utils.Target(selection => {
          this.getQxObject("edWorkResult").setVisibility(selection ? "visible" : "excluded");
          this.getQxObject("edWorkResult").setValue(selection);
        })
      );

    this._setLayout(new qx.ui.layout.VBox(5));
    this._add(new qx.ui.basic.Label("Current Work:"));
    this._add(this.getQxObject("btnRefreshCurrentWork"));
    this._add(this.getQxObject("tblCurrentWork"), { flex: 1 });
    this._add(new qx.ui.basic.Label("Past Work:"));
    this._add(this.getQxObject("compSearchField"));
    this._add(this.getQxObject("tblPastWork"), { flex: 1 });
    this._add(this.getQxObject("edWorkResult"), { flex: 0 });
  },
  properties: {
    value: {
      check: "zx.server.work.ui.model.Scheduler",
      nullable: true,
      event: "changeValue",
      apply: "_applyValue"
    }
  },

  objects: {
    btnRefreshCurrentWork() {
      let btn = new qx.ui.toolbar.Button("Refresh", "@FontAwesome/arrows-rotate/16").set({ allowGrowX: false });
      btn.addListener("execute", this.__refreshCurrentWork, this);
      return btn;
    },
    tblCurrentWork() {
      let tbl = new zx.server.work.ui.ScheduledTasksTable().set({ minHeight: 100, maxHeight: 200 });
      return tbl;
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
      return new zx.server.work.ui.WorkResultsTable().set({ minHeight: 100 });
    },

    edWorkResult() {
      return new zx.server.work.ui.WorkResultEditor().set({ visibility: "excluded" });
    }
  },

  members: {
    __refreshId: 0,
    _applyValue(value, old) {
      if (value) {
        this.__refreshCurrentWork();
      }
    },
    async __refresh() {
      let id = ++this.__refreshId;
      if (!this.getValue()) {
        return; // no scheduler set
      }
      let search = this.getQxObject("searchField").getValue();
      let table = this.getQxObject("tblPastWork");
      table.resetModel();
      let model = await this.getValue().getPastWorkResults({ text: search });
      if (id !== this.__refreshId) {
        return;
      }
      if (this.getQxObject("btnShowStarred").getValue()) {
        let userData = zx.server.work.ui.UserData.getInstance();
        model = model.filter(item => userData.getStarredWorkResults().includes(item.toUuid()));
      }
      model.sort((a, b) => b.getStarted().getTime() - a.getStarted().getTime());
      table.setModel(new qx.data.Array(model));
    },
    async __refreshCurrentWork() {
      let tbl = this.getQxObject("tblCurrentWork");
      let ds = tbl.getDataSource();
      ds.getModel()?.forEach(model => model.dispose());
      ds.resetModel();
      let value = this.getValue();
      let model = await value.getCurrentWork();
      if (value !== this.getValue()) {
        return; // value changed while we were loading
      }
      ds.setModel(new qx.data.Array(model));
    }
  }
});
