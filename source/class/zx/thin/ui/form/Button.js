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

qx.Class.define("zx.thin.ui.form.Button", {
  extend: qx.html.Element,

  construct(caption, icon) {
    super("button");
    this.initButtonStyle();
    if (caption) {
      this.setCaption(caption);
    }
    if (icon) {
      this.setIcon(icon);
    }
    this.add(this.getQxObject("icon"));
    this.add(this.getQxObject("text"));
    this.addListener("pointerdown", () => this.addClass("qx-button-down"));
    this.addListener("pointerup", () => this.removeClass("qx-button-down"));
    this.addListener("click", evt => {
      if (this.hasListener("execute")) {
        evt.preventDefault();
        this.fireEvent("execute");
      }
    });
  },

  properties: {
    /** Refine the main CSS class */
    cssClass: {
      init: "qx-button",
      refine: true
    },

    /** Style of button (see Materials style) */
    buttonStyle: {
      init: "contained",
      check: ["contained", "outlined", "text", "toggle"],
      apply: "_applyButtonStyle"
    },

    /** Icon */
    icon: {
      init: null,
      nullable: true,
      check: "String",
      apply: "_applyIcon"
    },

    /** Caption */
    caption: {
      init: null,
      nullable: true,
      check: "String",
      apply: "_applyCaption"
    },

    /** What parts to display */
    showParts: {
      init: "both",
      nullable: false,
      check: ["icon", "label", "both"],
      apply: "__updateVisibility"
    },

    /** Value of this button click */
    value: {
      init: null,
      nullable: true
    },

    /** Whether the button is enabled */
    enabled: {
      init: false,
      check: "Boolean",
      event: "changeEnabled",
      apply: "_applyEnabled"
    },

    /** Temporary style applied when blocking for loading or similar */
    loadingStyle: {
      init: null,
      nullable: true,
      check: "String",
      apply: "_applyLoadingStyle"
    },

    /** Enables a blocking mode on the button */
    loading: {
      init: false,
      check: "Boolean",
      apply: "_applyLoading"
    }
  },

  events: {
    execute: "qx.event.type.Event"
  },

  members: {
    __loading: null,

    /**
     * Apply for `buttonStyle`
     */
    _applyButtonStyle(value, oldValue) {
      if (oldValue) {
        this.removeClass("qx-button-" + oldValue);
      }
      this.addClass("qx-button-" + value);
    },

    /**
     * Apply for `caption`
     */
    _applyCaption(value) {
      this.getQxObject("text").setText(value || "");
    },

    /**
     * Apply for `icon`
     */
    _applyIcon(value) {
      let elem = this.getQxObject("icon");
      elem.setSource(value);
      this.__updateVisibility();
    },

    /**
     * Makes sub elements visible or not as required
     */
    __updateVisibility() {
      let show = this.getShow();
      let elem = this.getQxObject("icon");
      elem.setVisible(show != "label" && this.getIcon() && !this.__isLoading());
      this.getQxObject("text").setVisible(show != "icon");
    },

    /**
     * Apply for `enabled`
     */
    _applyEnabled(value) {
      if (value) {
        this.removeClass("qx-disabled");
        this.setAttribute("disabled", "false");
      } else {
        this.addClass("qx-disabled");
        this.setAttribute("disabled", "true");
      }
    },

    /**
     * Apply for `loadingStyle`
     */
    _applyLoadingStyle(value) {
      let elem = this.getQxObjectId();
      if (elem) {
        this.remove(elem);
        this.removeOwnedQxObject(elem);
        elem.dispose();
      }
      if (value) {
        this.__loading = elem = zx.thin.core.LoadingStyles.getInstance().createElement(value);
        elem.setQxObjectId("loading");
        this.addOwnedQxObject(elem);
        let index = this.indexOf(this.getQxObject("text"));
        this.addAt(elem, index);
        elem.setVisible(this.__isLoading());
      }
      this.__updateVisibility();
    },

    /**
     * Apply for `loading`
     */
    _applyLoading(value) {
      if (this.__loading) {
        this.__loading.setVisible(value);
      }
      this.__updateVisibility();
    },

    /**
     * Helper test for whether we're loading
     *
     * @returns
     */
    __isLoading() {
      return !!this.getLoadingStyle() && this.isLoading();
    },

    /**
     * @Override
     */
    _createQxObjectImpl(id) {
      switch (id) {
        case "icon":
          return new zx.thin.ui.basic.Image().set({ visible: false });

        case "text":
          return <span></span>;
      }

      return super._createQxObjectImpl(id);
    }
  }
});
