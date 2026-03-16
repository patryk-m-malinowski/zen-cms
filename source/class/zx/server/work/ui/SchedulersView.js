/**
 * UI for managing schedulers, pools, and workers.
 */
qx.Class.define("zx.server.work.ui.SchedulersView", {
  extend: qx.ui.core.Widget,

  construct() {
    super();
    this._setLayout(new qx.ui.layout.HBox(5));
    this._add(this.getQxObject("schedulersTree"), { flex: 0 });
    this._add(this.getQxObject("scroll"), { flex: 1 });

    //ensure that the correct editor is shown based on the selection in the tree
    this.getQxObject("schedulersTree")
      .getDatagrid()
      .bind(
        "selection[0]",
        new zx.utils.Target(selection => {
          this.getQxObject("stack").resetSelection();
          this.getQxObject("edWorkerTracker").setValue(null);
          let edName = null;
          if (selection instanceof zx.server.work.ui.model.WorkerTracker) {
            edName = "edWorkerTracker";
          } else if (selection instanceof zx.server.work.ui.model.Scheduler) {
            edName = "edScheduler";
          } else if (selection instanceof zx.server.work.ui.model.WorkerPool) {
            edName = "edWorkerPool";
          }
          if (edName) {
            let ed = this.getQxObject(edName);
            this.getQxObject("stack").setSelection([ed]);
            ed.setValue(selection);
          }
        })
      );
  },

  objects: {
    schedulersTree() {
      return new zx.server.work.ui.SchedulersTree().set({ width: 300 });
    },
    scroll() {
      let scroll = new qx.ui.container.Scroll();
      scroll.add(this.getQxObject("stack"));
      return scroll;
    },
    stack() {
      let stack = new qx.ui.container.Stack();
      stack.add(this.getQxObject("edScheduler"));
      stack.add(this.getQxObject("edWorkerPool"));
      stack.add(this.getQxObject("edWorkerTracker"));
      stack.resetSelection();
      return stack;
    },
    edWorkerPool() {
      return new zx.server.work.ui.WorkerPoolEditor();
    },
    edScheduler() {
      return new zx.server.work.ui.SchedulerEditor();
    },
    edWorkerTracker() {
      return new zx.server.work.ui.WorkerTrackerEditor();
    }
  }
});
