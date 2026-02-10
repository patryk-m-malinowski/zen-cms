/* ************************************************************************
 *
 *  Zen [and the art of] CMS
 *
 *  https://zenesis.com
 *
 *  Copyright:
 *    2019-2025 Zenesis Ltd, https://www.zenesis.com
 *
 *  License:
 *    MIT (see LICENSE in project root)
 *
 *  Authors:
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************ */

qx.Class.define("zx.app.simplepages.SimplePiecesEditor", {
  extend: zx.ui.editor.FormEditor,

  construct() {
    super();
  },

  members: {
    _applyValue(value, oldValue) {
      super._applyValue(value, oldValue);
    },

    refresh() {
      let tree = this.getQxObject("tree");
      let root = this.getQxObject("root");

      const clearChildren = node => {
        node.getChildren().forEach(child => {
          clearChildren(child);
          node.remove(child);
        });
      };
      clearChildren(root);

      let pieces = this.getValue();
      if (!pieces) {
        return;
      }

      const addPieces = pieces => {
        pieces.forEach(piece => {
          let node = new qx.ui.tree.TreeFolder();
        });
      };

      addPieces(pieces);
    },

    _createQxObjectImpl(id) {
      switch (id) {
        case "compTree":
          var comp = new qx.ui.container.Composite(new qx.ui.layout.VBox());
          comp.add(this.getQxObject("toolbar"));
          comp.add(this.getQxObject("tree"), { flex: 1 });
          return comp;

        case "toolbar":
          var tb = new qx.ui.toolbar.ToolBar();
          tb.add(this.getQxObject("btnAdd"));
          tb.add(this.getQxObject("btnDelete"));
          tb.add(this.getQxObject("btnRefresh"));
          return tb;

        case "btnAdd":
          var btn = new qx.ui.toolbar.Button("Create", "@FontAwesome/plus-square/16");
          btn.addListener("execute", () => {});
          return btn;

        case "btnDelete":
          var btn = new qx.ui.toolbar.Button("Delete", "@FontAwesome/times-circle/16").set({
            enabled: false,
            showFeatures: "icon"
          });

          btnDelete.addListener("execute", () => {});
          return btn;

        case "btnRefresh":
          var btn = new qx.ui.toolbar.Button("Refresh", "@FontAwesome/arrows-rotate/16");
          btnDelete.addListener("execute", () => {});
          return btn;

        case "tree":
          return new qx.ui.tree.Tree();

        case "root":
          var root = new qx.ui.tree.TreeFolder("root");
          root.setOpen(true);
          this.getQxObject("tree").setRoot(root);
          return root;
      }

      return super._createQxObjectImpl(id);
    }
  }
});
