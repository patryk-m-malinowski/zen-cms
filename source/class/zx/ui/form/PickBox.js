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

qx.Class.define("zx.ui.form.PickBox", {
  extend: qx.ui.core.Widget,
  implement: [qx.ui.form.IForm, qx.ui.form.IField],
  include: [qx.ui.form.MForm],

  construct() {
    super();
    this._setLayout(new qx.ui.layout.HBox());
    this._add(this.getChildControl("label"), { flex: 1 });
    this._add(this.getChildControl("pick"));
  },

  properties: {
    appearance: {
      init: "pickbox",
      refine: true
    },

    /** The value on display */
    value: {
      init: null,
      nullable: true,
      event: "changeValue"
    },

    /** The editor to show in the popup dialog */
    editor: {
      check: "zx.ui.editor.FormEditor",
      apply: "_applyEditor"
    },

    /** Path to bind for the display */
    labelPath: {
      check: "String",
      event: "changeLabelPath",
      apply: "__rebindLabel"
    },

    /** Options to pass to `qx.data.SingleValueBinding` for the label */
    labelOptions: {
      init: null,
      nullable: true,
      event: "changeLabelOptions",
      apply: "__rebindLabel"
    },

    /** Path to bind for the icon in the display */
    iconPath: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeIconPath",
      apply: "__rebindLabelPath"
    },

    /** Options to pass to `qx.data.SingleValueBinding` for the icon */
    iconOptions: {
      init: null,
      nullable: true,
      event: "changeIconOptions",
      apply: "__rebindLabel"
    }
  },

  members: {
    /**
     * Shows the pick dialog and applies its value
     */
    async _pick() {
      let dlg = this.getQxObject("dlg");
      let ed = this.getEditor();
      ed.setValue(this.getValue());
      let result = await dlg.open();
      if (result == "ok") {
        let value = ed.getValue();
        this.setValue(value);
      }
      ed.setValue(null);
    },

    /**
     * Apply for label and icon properties
     */
    __rebindLabel() {
      if (this.__labelBindingId) {
        this.removeBinding(this.__labelBindingId);
        this.__labelBindingId = null;
      }
      this.__labelBindingId = this.bind("value." + this.getLabelPath(), this.getChildControl("label"), "label", this.getLabelOptions());

      if (this.__iconBindingId) {
        this.removeBinding(this.__iconBindingId);
        this.__iconBindingId = null;
      }
      if (this.getIconPath()) {
        this.__iconBindingId = this.bind("value." + this.getIconPath(), this.getChildControl("label"), "icon", this.getIconOptions());
      }
    },

    /**
     * Apply for `editor`
     */
    _applyEditor(value) {
      this.getQxObject("dlg").setEditor(value);
    },

    /**
     * @Override
     */
    _createChildControlImpl(id, hash) {
      switch (id) {
        case "label":
          return new qx.ui.basic.Atom().set({ allowGrowX: true });

        case "pick":
          var btn = new qx.ui.form.Button("Pick").set({ showFeatures: "icon" });
          btn.addListener("execute", () => this._pick());
          return btn;
      }

      return super._createChildControlImpl(id, hash);
    },

    /**
     * @Override
     */
    _createQxObjectImpl(id) {
      switch (id) {
        case "dlg":
          return new zx.ui.utils.EditorDialog(this.getEditor()).set({
            buttons: ["ok", "cancel"]
          });
      }

      return super._createQxObjectImpl(id);
    }
  }
});
