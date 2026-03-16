qx.Class.define("zx.server.work.ui.TasksView", {
  extend: qx.ui.core.Widget,
  construct() {
    super();
    let transport = zx.server.work.ui.SchedulerMgr.getTransport();
    this.__api = zx.io.api.ApiUtils.createClientApi(zx.server.work.scheduler.ITasksApi, transport, "/tasks");

    let refreshTimer = new zx.utils.Timeout(2000, () => this.__refreshResults()).set({ recurring: true });
    this.addListener("appear", () => refreshTimer.setEnabled(true));
    this.addListener("disappear", () => refreshTimer.setEnabled(false));

    this._setLayout(new qx.ui.layout.Grow());
    this._add(this.getQxObject("splitPane"));
  },
  objects: {
    splitPane() {
      let sp = new qx.ui.splitpane.Pane("horizontal");
      sp.add(this.getQxObject("compTasks"), 1);
      sp.add(this.getQxObject("edTask"), 0);
      return sp;
    },
    compTasks() {
      let comp = new qx.ui.container.Composite(new qx.ui.layout.VBox(5));
      comp.add(this.getQxObject("compEdtSearch"));
      comp.add(this.getQxObject("tblTasks"));
      return comp;
    },
    compEdtSearch() {
      let comp = new qx.ui.container.Composite(new qx.ui.layout.HBox(5));
      comp.add(this.getQxObject("edtSearch"), { flex: 1 });
      comp.add(this.getQxObject("cbxShowRunning"));
      return comp;
    },
    edtSearch() {
      let searchField = new zx.ui.form.SearchField();
      searchField.addListener("search", async evt => {
        let table = this.getQxObject("tblTasks");
        table.resetModel();
        this.__refreshResults();
      });
      searchField.bind("value", this.getQxObject("cbxShowRunning"), "enabled", {
        converter: value => !(value && value.length > 0)
      });
      searchField.linkWidget(this.getQxObject("cbxShowRunning"));
      return searchField;
    },
    cbxShowRunning() {
      let cbx = new qx.ui.form.CheckBox("Show Running Only");
      cbx.setValue(true);
      return cbx;
    },
    tblTasks() {
      let table = new zx.server.work.ui.TasksTable().set({ minHeight: 400 });
      table.getDatagrid().bind("selection[0]", this.getQxObject("edTask"), "value");
      table.getDatagrid().bind("selection[0]", this.getQxObject("edTask"), "visibility", {
        converter: sel => (sel ? "visible" : "excluded")
      });
      return table;
    },
    edTask() {
      return new zx.server.work.ui.TaskEditor();
    }
  },
  members: {
    __refreshResultsId: 0,
    /**
     * @type {zx.server.work.scheduler.ITasksApi}
     */
    __api: null,

    async __refreshResults() {
      let id = ++this.__refreshResultsId;
      let api = this.__api;
      let query = this.getQxObject("edtSearch").getValue();
      let runningOnly = query?.length ? false : this.getQxObject("cbxShowRunning").getValue();
      let tasksJson = await api.searchTasks({ text: query, runningOnly: runningOnly, maxResults: 200 });
      if (id !== this.__refreshResultsId) {
        //search was changed while we were waiting for the results
        return;
      }
      let table = this.getQxObject("tblTasks");
      let tasks = new qx.data.Array(tasksJson.map(task => zx.server.work.ui.model.ScheduledTask.get(api, task)));
      table.setModel(tasks);
    }
  }
});
