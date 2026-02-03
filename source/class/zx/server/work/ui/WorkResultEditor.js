/**
 * UI for managing a work result, displaying details such as work class name, title, description, and console output.
 */
qx.Class.define("zx.server.work.ui.WorkResultEditor", {
  extend: qx.ui.core.Widget,
  construct() {
    super();
    this._setLayout(new qx.ui.layout.Grow());
    this._add(this.getQxObject("tabView"));

    this.bind("value.tracker", this.getQxObject("compRunningOnly"), "visibility", {
      converter: value => (value ? "visible" : "excluded")
    });

    this.bind("value.completed", this.getQxObject("btnKill"), "visibility", {
      converter: value => (value ? "excluded" : "visible")
    });

    this.bind("value.userKilled", this.getQxObject("btnKill"), "enabled", {
      converter: value => !value
    });

    this.__debounceUpdateConsoleOutput = new zx.utils.Debounce(() => {
      let value = this.getValue();
      if (value) {
        this.getQxObject("edtConsoleOutput").setValue(value.getLogOutput());
      }
    }, 1000);
  },

  properties: {
    value: {
      check: "zx.server.work.ui.model.WorkResult",
      event: "changeValue",
      init: null,
      nullable: true,
      apply: "_applyValue"
    }
  },

  objects: {
    tabView() {
      let tv = new qx.ui.tabview.TabView();
      tv.add(this.getQxObject("pageDetails"));
      tv.add(this.getQxObject("pageConsoleOutput"));
      return tv;
    },

    pageDetails() {
      let pg = new qx.ui.tabview.ScrollingPage("Details");
      let comp = pg.getChildrenContainer();
      comp.setLayout(new qx.ui.layout.VBox(5));
      comp.add(this.getQxObject("compRunningOnly"));
      comp.add(this.getQxObject("toolbar"));
      comp.add(new qx.ui.basic.Label("Title:"));
      comp.add(this.getQxObject("edtTitle"));
      this.bind("value.title", this.getQxObject("edtTitle"), "value");
      comp.add(new qx.ui.basic.Label("Description:"));
      comp.add(this.getQxObject("edtDescription"));
      this.bind("value.description", this.getQxObject("edtDescription"), "value");
      comp.add(new qx.ui.basic.Label("Work JSON:"));
      comp.add(this.getQxObject("edtWorkJson"));
      this.bind("value.workJson", this.getQxObject("edtWorkJson"), "value", {
        converter: value => (value ? zx.utils.Json.stringifyJson(value, null, 2) : null)
      });
      let labelException = new qx.ui.basic.Label("Exception:");
      comp._add(labelException);
      comp._add(this.getQxObject("edtExceptionStack"));
      this.bind("value.exceptionStack", this.getQxObject("edtExceptionStack"), "value");
      this.bind(
        "value.exceptionStack",
        new zx.utils.Target(value => {
          labelException.setVisibility(value ? "visible" : "excluded");
          this.getQxObject("edtExceptionStack").setVisibility(value ? "visible" : "excluded");
          this.getQxObject("edtExceptionStack").setValue(value);
        })
      );
      return pg;
    },

    pageConsoleOutput() {
      let pg = new qx.ui.tabview.Page("Output");
      pg.setLayout(new qx.ui.layout.VBox());
      pg._add(this.getQxObject("edtConsoleOutput"), { flex: 1 });
      return pg;
    },

    compRunningOnly() {
      let comp = new qx.ui.container.Composite(new qx.ui.layout.HBox(5).set({ alignY: "middle" })).set({ visibility: "excluded" });
      comp.add(new qx.ui.basic.Label("Last Activity:"));
      comp.add(this.getQxObject("edtLastActivity"));
      comp.add(this.getQxObject("btnKill"));
      return comp;
    },

    edtLastActivity() {
      let edt = new qx.ui.form.TextField().set({ readOnly: true, minWidth: 300 });

      let df = new qx.util.format.DateFormat("dd/MM/yyyy HH:mm:ss");

      const update = () => {
        let out;
        let value = this.getValue()?.getTracker()?.getLastActivity();
        if (!value) {
          out = null;
        } else {
          let diff = Date.now() - value.getTime();
          out = df.format(value) + ` (${Math.round(diff / 1000)} seconds ago)`;
        }
        edt.setValue(out);
      };

      setInterval(update, 1000);
      this.bind(
        "value.tracker",
        new zx.utils.Target(tracker => {
          update();
        })
      );
      return edt;
    },

    toolbar() {
      let tb = new qx.ui.toolbar.ToolBar();
      tb.add(this.getQxObject("btnStarred"));
      return tb;
    },

    btnStarred() {
      let btn = new qx.ui.toolbar.CheckBox(null, "@FontAwesome/star/16");
      btn.addListener("changeValue", evt => {
        if (!this.getValue() || this.__inApplyValue) {
          return;
        }
        let checked = evt.getData();
        let userData = zx.server.work.ui.UserData.getInstance();
        if (checked) {
          if (!userData.getStarredWorkResults().includes(this.getValue().toUuid())) {
            userData.getStarredWorkResults().push(this.getValue().toUuid());
          }
        } else {
          userData.getStarredWorkResults().remove(this.getValue().toUuid());
        }
      });
      return btn;
    },

    btnKill() {
      let btn = new qx.ui.toolbar.Button("Kill", "@FontAwesome/xmark/16");
      btn.addListener("execute", async () => {
        let response = await zx.ui.utils.MessageDlg.showConfirmation("Are you sure you want to kill this work?", "Kill Work");
        if (response !== "yes") {
          return;
        }
        let task = zx.ui.utils.progress.Popup.getInstance().addTask("Killing Work");
        await this.getValue()
          .kill()
          .finally(() => {
            task.release();
          })
          .catch(err => {
            return zx.ui.utils.MessageDlg.showError("Failed to kill work: " + err.message, "Kill Work");
          });
      });
      return btn;
    },

    edtTitle() {
      return new qx.ui.form.TextField().set({ readOnly: true });
    },

    edtDescription() {
      return new qx.ui.form.TextArea().set({ readOnly: true, minWidth: 400, minHeight: 150 });
    },

    edtWorkJson() {
      return new qx.ui.form.TextArea().set({ readOnly: true, minWidth: 400, minHeight: 150, wrap: false });
    },

    edtConsoleOutput() {
      return new qx.ui.form.TextArea().set({ readOnly: true, minWidth: 600, minHeight: 450 });
    },

    edtExceptionStack() {
      return new qx.ui.form.TextArea().set({ readOnly: true, minWidth: 400, minHeight: 300 });
    }
  },

  members: {
    /** @type{Boolean} anti-recursion flag */
    __inApplyValue: false,

    /** @type{zx.utils.Debounce} dbounces updates to the console output */
    __debounceUpdateConsoleOutput: null,

    /**
     * @Override
     */
    _applyValue(value, oldValue) {
      this.__inApplyValue = true;
      if (value) {
        let userData = zx.server.work.ui.UserData.getInstance();
        this.getQxObject("btnStarred").setValue(userData.getStarredWorkResults().includes(value.toUuid()));
        value.addListener("changeLogOutput", this.__onLogOutputChange, this);
      } else {
        this.getQxObject("btnStarred").setValue(false);
      }
      if (oldValue) {
        oldValue.removeListener("changeLogOutput", this.__onLogOutputChange, this);
      }
      this.__inApplyValue = false;
    },

    /**
     * Event handler for log output changes; trigger a debounced update of the console output.
     *
     * @param {qx.event.type.Data} evt
     */
    __onLogOutputChange(evt) {
      this.__debounceUpdateConsoleOutput.run();
    }
  }
});
