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

qx.Class.define("zx.ui.form.SearchField", {
  extend: qx.ui.core.Widget,
  implement: [qx.ui.form.IStringForm, qx.ui.form.IForm],
  include: [qx.ui.form.MForm, zx.ui.editor.MField],

  construct() {
    super();
    this._setLayout(new qx.ui.layout.HBox());
    this._add(this.getChildControl("field"), {
      flex: 1
    });

    this._add(this.getChildControl("buttons"));
    this.__timeout = new zx.utils.Timeout(0, this._onInactivityTimeout, this);
    this.bind("timeout", this.__timeout, "duration");
    this.addListenerOnce("appear", evt => {
      if (this.isAllowEmptyValue() && this.isAutoSearch()) {
        this.__doSearch();
      }
    });
  },

  properties: {
    /** Alignment of the text */
    textAlign: {
      check: ["left", "center", "right"],
      nullable: true,
      themeable: true,
      apply: "_applyXxxx"
    },

    /** Whether the field is read only */
    readOnly: {
      check: "Boolean",
      apply: "_applyXxxx",
      event: "changeReadOnly",
      init: false
    },

    /** Maximal number of characters that can be entered in the TextArea. */
    maxLength: {
      check: "PositiveInteger",
      apply: "_applyXxxx",
      init: Infinity
    },

    /**
     * Whether the {@link #changeValue} event should be fired on every key
     * input. If set to true, the changeValue event is equal to the
     * {@link #input} event.
     */
    liveUpdate: {
      check: "Boolean",
      init: false,
      apply: "_applyXxxx"
    },

    /**
     * String value which will be shown as a hint if the field is all of: unset,
     * unfocused and enabled. Set to null to not show a placeholder text.
     */
    placeholder: {
      check: "String",
      nullable: true,
      apply: "_applyXxxx"
    },

    /**
     * RegExp responsible for filtering the value of the textfield. the RegExp
     * gives the range of valid values. The following example only allows digits
     * in the textfield.
     *
     * <pre class='javascript'>
     * field.setFilter(/[0-9]/);
     * </pre>
     */
    filter: {
      check: "RegExp",
      nullable: true,
      init: null,
      apply: "_applyXxxx"
    },

    /** Inactivity timeout (milliseconds) */
    timeout: {
      check: "Number",
      init: 500,
      nullable: false,
      event: "changeTimeout"
    },

    /** Whether the auto search should fire if the field is empty */
    allowEmptyValue: {
      check: "Boolean",
      init: true,
      nullable: false,
      event: "changeAllowEmptyValue"
    },

    /** Whether the auto search should fire when it first appears */
    autoSearch: {
      check: "Boolean",
      init: true,
      nullable: false,
      event: "changeAutoSearch"
    },

    // overridden
    appearance: {
      refine: true,
      init: "searchfield"
    },

    // overridden
    allowGrowY: {
      refine: true,
      init: false
    },

    // overridden
    allowShrinkY: {
      refine: true,
      init: false
    }
  },

  events: {
    /**
     * Fired when the search button is clicked, data is the value
     */
    search: "qx.event.type.Data",

    /**
     * The event is fired on every keystroke modifying the value of the field.
     *
     * The method {@link qx.event.type.Data#getData} returns the current value
     * of the text field.
     */
    input: "qx.event.type.Data",

    /**
     * The event is fired each time the text field looses focus and the text
     * field values has changed.
     *
     * If you change {@link #liveUpdate} to true, the changeValue event will be
     * fired after every keystroke and not only after every focus loss. In that
     * mode, the changeValue event is equal to the {@link #input} event.
     *
     * The method {@link qx.event.type.Data#getData} returns the current text
     * value of the field.
     */
    changeValue: "qx.event.type.Data"
  },

  members: {
    __timeout: null,
    __lastSearchValue: null,

    /**
     * Callback for inactivity timeout
     */
    _onInactivityTimeout(evt) {
      if (!this.__lastSearchValue || this.__lastSearchValue != this.getValue()) {
        this.__doSearch();
      }
    },

    /**
     * Callback for any keypress
     *
     * @param evt
     */
    __onKeyPress(evt) {
      if (evt.getKeyIdentifier() == "Enter") {
        this.__timeout.killTimer();
        this.__doSearch();
      } else this.__timeout.resetTimer();
    },

    /**
     * Callback for keypress which caused input
     *
     * @param evt
     */
    __onKeyInput(evt) {
      this.resetTimer();
    },

    /**
     * Allows the timer to be reset/restarted externally, eg when there are other UI fields
     */
    resetTimer() {
      this.__timeout.resetTimer();
    },

    linkWidget(widget) {
      if (typeof widget.getSelection == "function") {
        widget.addListener("changeSelection", () => this.resetTimer());
      }
      widget.addListener("changeValue", () => this.resetTimer());
    },

    /**
     * Callback for a timeout
     *
     * @param userData
     * @param timerId
     */
    __doSearch(userData, timerId) {
      var str = this.getValue();
      if (!str) {
        str = "";
      }
      this.setValue(str);
      if (str || this.isAllowEmptyValue()) {
        this.__lastSearchValue = str;
        this.fireDataEvent("search", str);
      }
    },

    /**
     * ApplyXxxx
     */
    _applyXxxx(value, oldValue, name) {
      this.getChildControl("field")["set" + qx.lang.String.firstUp(name)](value);
    },

    /**
     * set accessor for psuedo property
     */
    setValue(value) {
      this.__timeout.killTimer();
      return this.getChildControl("field").setValue(value);
    },

    /**
     * get accessor for psuedo property
     */
    getValue() {
      var str = this.getChildControl("field").getValue();
      if (str) {
        str = str.trim();
        if (!str.length) {
          return null;
        }
      }
      return str;
    },

    /**
     * reset accessor for psuedo property
     */
    resetValue() {
      this.__timeout.killTimer();
      return this.getChildControl("field").resetValue();
    },

    /*
     * @Override
     */
    _createChildControlImpl(id, hash) {
      switch (id) {
        case "field":
          var fld = new qx.ui.form.TextField();
          fld.addListener("input", evt => this.fireDataEvent("input", evt.getData()));

          fld.addListener("changeValue", evt => this.fireDataEvent("changeValue", evt.getData()));

          fld.addListener("keypress", this.__onKeyPress, this);
          fld.addListener("keyinput", this.__onKeyInput, this);
          return fld;

        case "buttons":
          var comp = new qx.ui.container.Composite(new qx.ui.layout.HBox());
          comp.add(this.getChildControl("btnSearch"));
          return comp;

        case "btnSearch":
          var btn = new qx.ui.form.Button("Search", "@FontAwesomeSolid/search/16").set({ appearance: "inlinebutton", showFeatures: "icon" });
          btn.addListener("execute", this.__doSearch, this);
          return btn;
      }

      return super._createChildControlImpl(id, hash);
    }
  }
});
