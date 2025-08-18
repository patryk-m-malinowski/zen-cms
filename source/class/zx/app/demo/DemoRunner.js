/* ************************************************************************
 *
 *  Zen [and the art of] CMS
 *
 *  https://zenesis.com
 *
 *  Copyright:
 *    2019-2022 Zenesis Ltd, https://www.zenesis.com
 *
 *  License:
 *    MIT (see LICENSE in project root)
 *
 *  Authors:
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************ */

/**
 * @asset(zx/demo/image/*)
 */
qx.Class.define("zx.app.demo.DemoRunner", {
  extend: qx.ui.core.Widget,

  construct() {
    super();
    let arr = (this.__selectedDemos = new qx.data.Array());
    arr.addListener("change", () => {
      if (arr.getLength() && !arr.contains(this.getCurrentDemo())) {
        this.setCurrentDemo(arr.getItem(0));
      } else this.setCurrentDemo(null);
    });
    this.__selectedDemoResults = new qx.data.Array();
    this.__demoResults = new qx.data.Array();
    this.__demoResultsByDemoHash = {};
    this.__nodesByPath = {};
    this.__demoUiRoots = {};

    this._setLayout(new qx.ui.layout.VBox());
    this._add(this.getQxObject("header"));
    this._add(this.getQxObject("pane"), { flex: 1 });
  },

  properties: {
    /** The current selected demonstrator */
    currentDemo: {
      init: null,
      check: "zx.app.demo.Demonstrator",
      nullable: true,
      event: "changeCurrentDemo",
      apply: "_applyCurrentDemo"
    },

    /** The currently selected test name */
    currentTestName: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeCurrentTestName",
      apply: "_applyCurrentTestName"
    },

    /** Currently selected test result */
    currentTestResult: {
      init: null,
      nullable: true,
      check: "zx.app.demo.TestResult",
      event: "changeCurrentTestResult",
      apply: "_applyCurrentTestResult"
    }
  },

  members: {
    __nodesByPath: null,
    __demoUiRoots: null,
    __selectedDemos: null,
    __selectedDemoResults: null,
    __demoResults: null,
    __demoResultsByDemoHash: null,
    __changingTreeSelection: false,

    /**
     * Apply method
     */
    async _applyCurrentDemo(value, oldValue) {
      let demoStack = this.getQxObject("demostack");
      if (oldValue) {
        oldValue.setActive(false);
        oldValue.removeListener("log", this.__updateDemonstratorLog, this);
      }
      if (value) {
        let firstTime = false;
        let uiRoot = this.__demoUiRoots[value.toHashCode()];
        if (uiRoot === undefined) {
          firstTime = true;
          uiRoot = this.__demoUiRoots[value.toHashCode()] = value.getUiRoot();
          if (uiRoot) {
            demoStack.add(uiRoot);
          }
        }
        if (uiRoot) {
          demoStack.setSelection([uiRoot]);
        } else demoStack.setSelection([]);
        value.setActive(true);
        value.addListener("log", this.__updateDemonstratorLog, this);
        if (firstTime) {
          await value.initialise();
        }
      } else {
        demoStack.setSelection([]);
      }
      this.__updateDemonstratorLog();
      this.getQxObject("btnReset").setEnabled(!!value && value.getSupportsReset());

      this.__updateUi();
    },

    /**
     * Updates the UI when the selection changes
     */
    async __updateUi() {
      async function findAsync(arr, fn) {
        for (let i = 0; i < arr.length; i++) {
          let match = await fn(arr[i]);
          if (match) {
            return arr[i];
          }
        }
        return null;
      }
      let hasTests = !!findAsync(this.__selectedDemos.toArray(), demo => demo.getTestNames().length > 0);

      this.getQxObject("btnRunTests").setEnabled(hasTests);
    },

    /**
     * Called to update the demonstrator log on display
     */
    __updateDemonstratorLog() {
      let txt = this.getQxObject("txtDemoLog");
      let demonstrator = this.getCurrentDemo();
      if (!demonstrator) {
        txt.setValue("");
      } else {
        txt.setValue(this.__formatLog(demonstrator.getLog()));
        txt.getContentElement().scrollToY(10000);
        /*
        let dom = txt.getContentElement().getDomElement();
        if (dom)
          dom.scrollTop = dom.scrollHeight;
        */
      }
    },

    /**
     * Apply method
     */
    _applyCurrentTestResult(value, oldValue) {
      if (oldValue) {
        oldValue.removeListener("log", this.__updateTestResultLog, this);
      }
      if (value) {
        value.addListener("log", this.__updateTestResultLog, this);
      }
      this.__updateTestResultLog();
    },

    /**
     * Updates the test result log display
     */
    __updateTestResultLog() {
      let txt = this.getQxObject("txtTestResult");
      let result = this.getCurrentTestResult();
      if (!result) {
        txt.setValue("");
      } else {
        txt.setValue(this.__formatLog(result.getLog()));
        txt.getContentElement().scrollToY(10000);
        /*
        let dom = txt.getContentElement().getDomElement();
        if (dom)
          dom.scrollTop = dom.scrollHeight;
        */
      }
    },

    /**
     * Formats log entries
     *
     * @param {Object[]} log entries
     * @returns
     */
    __formatLog(log) {
      log = log.map(entry => entry.msg).join("\n");
      return log;
    },

    /**
     * Apply method
     */
    _applyCurrentTestName(value) {
      this.getQxObject("btnRunTests").setEnabled(!!this.getCurrentDemo() && !!value);
    },

    /**
     * Adds a demonstrator
     *
     * @param {zx.app.demo.Demonstrator} demo
     */
    addDemonstrator(demo) {
      let classname = demo.getName();
      let segs = classname.split(".");
      let segPath = "";
      let lastNode = this.getQxObject("rootNode");
      for (let i = 0; i < segs.length; i++) {
        let seg = segs[i];
        if (i) {
          segPath += ".";
        }
        segPath += seg;
        let node = this.__nodesByPath[segPath];
        if (!node) {
          let iconUrl = i == segs.length - 1 ? "zx/demo/image/package18.gif" : "zx/demo/image/class18.gif";
          this.__nodesByPath[segPath] = node = new qx.ui.tree.TreeFolder(seg).set({
            icon: iconUrl,
            openSymbolMode: "always"
          });

          lastNode.add(node);
        }
        lastNode = node;
      }
      lastNode.setUserData("demo", demo);
      lastNode.addListenerOnce("changeOpen", async evt => {
        let names = await demo.getTestNames();
        names.forEach(name => {
          node = new qx.ui.tree.TreeFolder(name).set({
            icon: "zx/demo/image/method_public18.gif",
            openSymbolMode: "always"
          });

          node.setUserData("demo", demo);
          node.setUserData("testName", name);
          this.__nodesByPath[segPath + "." + name] = node;
          lastNode.add(node);
        });
      });
    },

    /**
     * Called when all demos have loaded - used to restore last selection
     */
    allDemosLoaded() {
      let nodePath = qx.bom.Cookie.get(this.classname + ".selectedNodePath");
      if (!nodePath) {
        return;
      }
      this.__changingTreeSelection = true;
      nodePath = nodePath.split(".");
      let node = this.getQxObject("rootNode");
      for (let i = 1; i < nodePath.length; i++) {
        node.setOpen(true);
        let children = node.getChildren();
        let name = nodePath[i].toLowerCase();
        let tmp = children.find(node => node.getLabel().toLowerCase() == name);
        if (tmp) {
          node = tmp;
        } else break;
      }
      if (node) {
        let tree = this.getQxObject("tree");
        tree.setSelection([node]);
      }
      this.__changingTreeSelection = false;
    },

    /**
     * Runs the selected tests
     */
    async _runTests() {
      this.getQxObject("tabview").setSelection([this.getQxObject("pgTestResults")]);

      for (let arr = this.__selectedDemos, i = 0; i < arr.getLength(); i++) {
        await this._runTest(arr.getItem(i));
      }
    },

    /**
     * Runs the tests for the given demonstrator
     * @param {zx.app.demo.Demonstrator} demonstrator
     */
    async _runTest(demonstrator) {
      this.setCurrentDemo(demonstrator);
      this.getQxObject("btnRunTests").set({ enabled: false });
      let hash = demonstrator.toHashCode();
      let results = this.__demoResultsByDemoHash[hash];
      if (results) {
        delete this.__demoResultsByDemoHash[hash];
        results.forEach(result => {
          result.dispose();
          this.__demoResults.remove(result);
          this.__selectedDemoResults.remove(result);
        });
      }
      results = this.__demoResultsByDemoHash[hash] = [];
      let names = await demonstrator.getTestNames();
      if (this.getCurrentTestName()) {
        names = names.filter(name => name == this.getCurrentTestName());
      }
      for (var i = 0; i < names.length; i++) {
        let result = demonstrator.runTest(names[i]);
        results.push(result);
        this.__demoResults.push(result);
        this.__selectedDemoResults.push(result);

        let id = result.addListener("log", evt => this._logFromTest(evt.getData()));

        await result.promiseComplete();
        result.removeListenerById(id);
      }
      this.getQxObject("btnRunTests").set({ enabled: true });
    },

    __updateUser() {
      let user = qx.core.Init.getApplication().getUser();
      if (user) {
        this.getQxObject("btnAccount").setMenu(this.getQxObject("mnuLoggedIn"));
        this.getQxObject("mniUsername").setLabel(user.getUsername());
      } else {
        this.getQxObject("btnAccount").setMenu(this.getQxObject("mnuLoggedOut"));
      }
    },

    /*
     * @Override
     */
    _createQxObjectImpl(id) {
      switch (id) {
        case "header":
          var header = new qx.ui.container.Composite(new qx.ui.layout.HBox()).set({
            appearance: "app-header"
          });

          header.add(this.getQxObject("btnAccount"));
          header.add(new qx.ui.basic.Label("ZenServer - Demonstrators and Unit Tests"));

          qx.core.Init.getApplication().addListener("changeUser", () => this.__updateUser());

          this.__updateUser();
          return header;

        case "btnAccount":
          return new qx.ui.form.MenuButton("My Account", "@FontAwesomeSolid/user-circle/32").set({
            showFeatures: "icon"
          });

        case "mnuLoggedIn":
          var mnu = new qx.ui.menu.Menu();
          mnu.add(this.getQxObject("mniUsername"));
          mnu.add(this.getQxObject("mniLogout"));
          return mnu;

        case "mnuLoggedOut":
          var mnu = new qx.ui.menu.Menu();
          mnu.add(this.getQxObject("mniLogin"));
          return mnu;

        case "mniUsername":
          var btn = new qx.ui.menu.Button("(no username)");
          return btn;

        case "mniLogin":
          var btn = new qx.ui.menu.Button("Login", "@FontAwesomeSolid/sign-in-alt/16");

          btn.addListener("execute", async () => {
            let dlg = new zx.app.utils.LoginFormDlg();
            dlg.open();
          });
          return btn;

        case "mniLogout":
          var btn = new qx.ui.menu.Button("Logout", "@FontAwesomeSolid/sign-out-alt/16");

          btn.addListener("execute", async () => {
            let loginApi = await qx.core.Init.getApplication().getNetController().getUriMapping("zx.server.auth.LoginApi");
            await loginApi.logout();
            qx.core.Init.getApplication().setUser(null);
          });
          return btn;

        case "pane":
          var comp = new qx.ui.splitpane.Pane();
          comp.add(this.getQxObject("tree"), 1);
          comp.add(this.getQxObject("demopane"), 3);
          return comp;

        case "demopane":
          var comp = new qx.ui.container.Composite(new qx.ui.layout.VBox());
          comp.add(this.getQxObject("toolbar"));
          comp.add(this.getQxObject("demostack"), { flex: 1 });
          comp.add(this.getQxObject("tabview"));
          return comp;

        case "toolbar":
          var tb = new qx.ui.toolbar.ToolBar();
          tb.add(this.getQxObject("btnReset"));
          tb.add(this.getQxObject("btnRunTests"));
          return tb;

        case "btnReset":
          var btn = new qx.ui.toolbar.Button("Reset", "@FontAwesomeSolid/sync-alt/16");

          btn.addListener("execute", async () => await this.getCurrentDemo().resetDemo());

          return btn;

        case "btnRunTests":
          var btn = new qx.ui.toolbar.Button("Run Tests", "@FontAwesomeSolid/running/16").set({ enabled: false });
          btn.addListener("execute", () => this._runTests());
          return btn;

        case "demostack":
          return new qx.ui.container.Stack();

        case "tree":
          var tree = new qx.ui.tree.Tree();
          var root = this.getQxObject("rootNode");
          root.setOpen(true);
          tree.setRoot(root);
          tree.addListener("changeSelection", evt => {
            let node = evt.getData()[0];
            let demo = node.getUserData("demo") || null;
            let testName = null;
            let demos;
            if (demo) {
              demos = [demo];
              testName = node.getUserData("testName") || null;
            } else {
              demos = [];
              const scan = node => {
                node.getChildren().forEach(child => {
                  let demo = child.getUserData("demo") || null;
                  if (demo) {
                    demos.push(demo);
                  } else scan(child);
                });
              };
              scan(node);
            }
            if (!this.__changingTreeSelection) {
              let nodePath = [];
              for (let tmp = node; tmp; tmp = tmp.getParent()) {
                nodePath.unshift(tmp.getLabel());
              }
              qx.bom.Cookie.set(this.classname + ".selectedNodePath", nodePath.join("."), 365, null, null, "Strict");
            }
            let selectedDemoResults = [];
            demos.forEach(demo => {
              let results = this.__demoResultsByDemoHash[demo.toHashCode()];
              if (results) {
                qx.lang.Array.append(selectedDemoResults, results);
              }
            });
            this.setCurrentTestName(null);
            this.__selectedDemos.replace(demos);
            this.__selectedDemoResults.replace(selectedDemoResults);
            if (demos.length == 1) {
              this.setCurrentDemo(demos[0]);
            }
            this.setCurrentTestName(testName);
            this.__updateUi();
          });
          this.__changingTreeSelection = true;
          tree.setSelection([root]);
          this.__changingTreeSelection = false;
          return tree;

        case "rootNode":
          return new qx.ui.tree.TreeFolder("Demonstrators");

        case "tabview":
          var tv = new qx.ui.tabview.TabView();
          tv.add(this.getQxObject("pgDemoLog"));
          tv.add(this.getQxObject("pgTestResults"));
          return tv;

        case "pgTestResults":
          var pg = new qx.ui.tabview.Page("Test Results");
          pg.setLayout(new qx.ui.layout.Grow());
          var comp = new qx.ui.splitpane.Pane("horizontal");
          pg.add(comp);

          comp.add(this.getQxObject("lstTestResults"));
          comp.add(this.getQxObject("txtTestResult"), 1);
          this.getQxObject("ctlrTestResults");
          return pg;

        case "pgDemoLog":
          var pg = new qx.ui.tabview.Page("Demonstrator Log");
          pg.setLayout(new qx.ui.layout.Grow());
          pg.add(this.getQxObject("txtDemoLog"));
          return pg;

        case "txtDemoLog":
          return new qx.ui.form.TextArea().set({
            readOnly: true,
            font: "monospace"
          });

        case "lstTestResults":
          return new qx.ui.form.List();

        case "ctlrTestResults":
          var ctlr = new qx.data.controller.List(this.__selectedDemoResults, this.getQxObject("lstTestResults"), "testName").set({
            labelOptions: {
              converter: (data, model, source, target) => {
                return target.getLabel();
              }
            },

            delegate: {
              createItem: () => new zx.app.demo.TestResultListItem(),
              bindItem: (ctlr, item, index) => {
                ctlr.bindProperty("", "model", null, item, index);
              }
            }
          });

          ctlr.addListener("changeSelection", evt => {
            let sel = ctlr.getSelection();
            let result = sel.getLength() ? sel.getItem(0) : null;
            this.setCurrentTestResult(result);
          });
          return ctlr;

        case "txtTestResult":
          return new qx.ui.form.TextArea().set({
            readOnly: true
          });
      }
    }
  }
});
