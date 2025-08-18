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

qx.Class.define("zx.ui.tree.column.AtomColumn", {
  extend: zx.ui.tree.column.Column,

  properties: {
    options: {
      init: null,
      nullable: true,
      event: "changeOptions"
    },

    iconPath: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeIconPath"
    },

    showFeatures: {
      init: "both",
      check: ["both", "icon", "label"],
      event: "changeShow"
    }
  },

  members: {
    /*
     * @Override
     */
    createDisplayWidget(row) {
      if (row.isHeader()) {
        return new qx.ui.basic.Label().set({
          rich: true,
          appearance: "tree-column-cell"
        });
      }

      return new qx.ui.basic.Atom();
    },

    /**
     * Returns the actual value for the cell icon
     */
    getIconValue(model) {
      var path = this.getIconPath();
      if (!path || !model) {
        return null;
      }
      return zx.utils.Values.getValue(model, path);
    },

    /*
     * @Override
     */
    _updateDisplayWidgetValueImpl(widget, model, row, value) {
      var opts = this.getOptions();
      var icon = this.getIconValue(model);
      if (opts && model) {
        if (typeof opts.getLabel == "function") {
          value = opts.getLabel.call(this, model);
        }
        if (typeof opts.getIcon == "function") {
          icon = opts.getIcon.call(this, model);
        }
      }
      if (row.isHeader()) {
        widget.setValue("" + (value || ""));
      } else widget.setLabel("" + (value || ""));
      if (!row.isHeader()) {
        widget.setIcon(icon);
        widget.setShowFeatures(this.getShowFeatures());
      }
    }
  }
});
