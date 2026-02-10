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

qx.Class.define("zx.ui.editor.FormEditor", {
  extend: zx.ui.editor.Editor,

  construct() {
    super();
    this.__groups = {};
    this.__widgetInfosByHash = {};
    this._resetter = this._createResetter();
    this._miscController = new qx.data.controller.Object();

    this.setRequiredFieldMessage(qx.locale.Manager.tr("This field is required"));
  },

  defer(statics, members) {
    qx.Class.include(qx.ui.form.AbstractField, zx.ui.editor.MField);
    qx.Class.include(qx.ui.form.AbstractSelectBox, zx.ui.editor.MField);
    qx.Class.include(qx.ui.form.List, zx.ui.editor.MField);
  },

  events: {
    /** Change event for the valid state. */
    changeValid: "qx.event.type.Data"
  },

  properties: {
    /** The validator of the form, can be `async` */
    validator: {
      init: null,
      nullable: true,
      check: "Function",
      event: "changeValidator"
    },

    /**
     * The invalid message should store the message why the form validation
     * failed. It will be added to the array returned by
     * {@link #getInvalidMessages}.
     */
    invalidMessage: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeInvalidMessage"
    },

    /**
     * Whether the editor is valid (including all fields)
     */
    valid: {
      init: true,
      check: "Boolean",
      event: "changeValid"
    },

    /**
     * This message will be shown if a required field is empty and no individual
     * {@link qx.ui.form.MForm#requiredInvalidMessage} is given.
     */
    requiredFieldMessage: {
      check: "String",
      init: ""
    },

    /**
     * Whether to show that the fields are invalid; "icon" shows an icon to the right,
     * "message" shows a label below
     */
    showFieldInvalid: {
      init: "icon",
      check: ["none", "icon", "message"]
    }
  },

  members: {
    /** @type{qx.data.controller.Object} the controller for non-form fields */
    _miscController: null,

    /** @type{Map<String,Object>} list of groups indexed by hash code, the value is a POJO of properties */
    __groups: null,

    /** @type{Map<String,Object} list of widget infos, indexed by widget hash code */
    __widgetInfosByHash: null,

    /**
     * @Override
     */
    _applyValue(value, oldValue) {
      this._miscController.setModel(value);
      let entity = this.getEntity();
      if (entity) {
        entity.setModified(false);
      }
      super._applyValue(value, oldValue);
    },

    /**
     * @Override
     */
    async setValue(value) {
      await super.setValue(value);
      if (value) {
        await this.validate();
      } else this.setValid(true);
    },

    /**
     * Adds a field to a composite and binds it.  This tries to use a Grid layout and will set the grid layout
     * if the composite `group` does not have a layout already, otherwise will use whatever is there already; the
     * labels are added if provided, and bi-directional binding is used with the `bindPath`.  Controllers and other
     * objects can be added, not just `qx.ui.form.IForm`.
     *
     * @param {qx.ui.container.Composite?} group optional group to add to
     * @param {qx.core.Object|String} widget if a string, then `getQxObject` is called to resolve it to an object
     * @param {String?} caption optional caption
     * @param {String?} bindPath optional bind path
     * @param {Object} options extra options if required
     */
    _addField(group, widget, caption, bindPath, options) {
      if (typeof widget == "string") {
        widget = this.getQxObject(widget);
      }
      options = options || {};

      var widgetInfo = {
        group,
        widget,
        options,
        bindPath
      };

      let layoutOptions = null;
      let isGrid = false;

      if (options.dataType) {
        const DATATYPES = {
          Integer: new zx.ui.editor.datatypes.Integer(),
          Number: new zx.ui.editor.datatypes.Number()
        };

        let dataType = DATATYPES[options.dataType];
        if (!dataType) {
          throw new Error("Unknown data type for field: " + dataType);
        }
        widgetInfo.dataType = dataType;
      }

      ["convertToTarget", "convertToModel", "onUpdateTarget", "onUpdateModel"].forEach(key => {
        if (typeof options[key] == "function") {
          widgetInfo[key] = options[key];
        }
      });

      // Configure the group
      if (group) {
        let groupInfo = this.__groups[group.toHashCode()];
        let layout = null;

        if (!groupInfo) {
          groupInfo = this.__groups[group.toHashCode()] = {
            group: group,
            widgetInfos: []
          };

          layout = group.getLayout();
          if (!layout) {
            layout = new qx.ui.layout.Grid(2, 2);
            group.setLayout(layout);
            layout.setColumnFlex(1, 1);
            layout.setColumnAlign(0, "right", "top");
          }
        } else {
          layout = group.getLayout();
        }
        isGrid = layout instanceof qx.ui.layout.Grid;

        // Create the label
        let label = options.label || caption;
        if (label) {
          if (label instanceof qx.ui.basic.Label) {
            caption = label.getValue();
          } else {
            caption = "" + label;
            label = new qx.ui.basic.Label(caption.length == 0 || !isGrid ? caption : caption + " :").set({
              rich: true,
              allowGrowX: true,
              allowShrinkX: true
            });

            if (isGrid) {
              label.setTextAlign("right");
            }
          }
        }
        widgetInfo.caption = caption;
        widgetInfo.label = label;

        let showFieldInvalid = this.getShowFieldInvalid();
        let widgetToAdd;
        if (showFieldInvalid != "none" && typeof widget.isValid == "function") {
          widgetToAdd = new qx.ui.container.Composite();
          widgetInfo.invalidMessageAtom = new zx.ui.editor.InvalidFieldWidget().set({ fieldWidget: widget });
          if (showFieldInvalid == "icon") {
            widgetToAdd.setLayout(new qx.ui.layout.HBox());
            widgetToAdd.add(widget, { flex: 1 });
            widgetToAdd.add(widgetInfo.invalidMessageAtom);
            widgetInfo.invalidMessageAtom.setShowFeatures("icon");
          } else {
            widgetToAdd.setLayout(new qx.ui.layout.VBox());
            widgetToAdd.add(widget);
            widgetToAdd.add(widgetInfo.invalidMessageAtom);
            widgetInfo.invalidMessageAtom.setShowFeatures("both");
          }
          widget.addListener("changeValid", this.__onWidgetChangeValid.bind(this, widgetInfo));
          this.__onWidgetChangeValid(widgetInfo, null);
        } else {
          widgetToAdd = widget;
        }
        widgetInfo.widgetToAdd = widgetToAdd;

        // Calculate layout options for the widget
        if (isGrid) {
          // Find the next available row
          let rowIndex = 0;
          group.getChildren().forEach(function (child) {
            var lp = child.getLayoutProperties();
            if (lp && typeof lp.row == "number" && lp.row >= rowIndex) {
              rowIndex = lp.row + 1;
            }
          });

          // options.layout can adjust the layout options
          if (options.layout) {
            if (options.layout.row !== undefined) {
              rowIndex = options.layout.row;
            } else if (options.layout.column !== undefined && options.layout.row == undefined) {
              if (rowIndex > 0 && !layout.getCellWidget(rowIndex - 1, options.layout.column)) {
                rowIndex--;
              }
            }
          }

          // If there is a label, add that first and then work out the widget layout options
          if (label != null) {
            // Label options
            layoutOptions = {
              row: rowIndex,
              column: options.layout && options.layout.column
            };

            if (layoutOptions.column === undefined) {
              layoutOptions.column = 0;
            }

            // Add the label
            group.add(label, layoutOptions);

            // Widget layout options
            if (options.layout) {
              options.layout.row = layoutOptions.row;
              options.layout.column = layoutOptions.column + 1;
              layoutOptions = options.layout;
            } else {
              layoutOptions = qx.lang.Object.clone(layoutOptions);
              layoutOptions.column++;
            }

            // No label, the widget layout options are much simpler
          } else {
            if (options.layout && options.layout.column === 0 && !widget.getAlignX()) {
              widget.setAlignX("left");
            }

            layoutOptions = qx.lang.Object.mergeWith(
              {
                row: rowIndex,
                column: 1
              },

              options.layout || {}
            );
          }

          // Not a grid, just add sequentially and again figure out the widget layout options
        } else {
          if (label) {
            group.add(label);
          }
          layoutOptions = options.layout;
        }

        widgetInfo.groupInfo = groupInfo;
        groupInfo.widgetInfos.push(widgetInfo);

        // Add the widget
        group.add(widgetInfo.widgetToAdd, layoutOptions);
      } else {
        if (options.label !== null && options.label !== undefined) {
          caption = "" + options.label;
        }
        widgetInfo.caption = caption;
      }

      // Add bindings
      if (bindPath) {
        this.__widgetInfosByHash[widget.toHashCode()] = widgetInfo;
        let bindingOptions = {
          options: {
            converter: qx.lang.Function.bind(this._convertToTarget, this, widgetInfo),
            onUpdate: qx.lang.Function.bind(this._onUpdateTarget, this, widgetInfo)
          },

          reverseOptions: {
            converter: qx.lang.Function.bind(this._convertToModel, this, widgetInfo),
            onUpdate: qx.lang.Function.bind(this._onUpdateModel, this, widgetInfo)
          }
        };

        const listenToSelectionChanges = (widget, propertyName) => {
          let onModified = this.__onWidgetModified.bind(this, widgetInfo);
          let upname = qx.lang.String.firstUp(propertyName);
          widget.addListener("change" + upname, evt => {
            if (evt.getOldData()) {
              evt.getOldData().removeListenerById(widgetInfo.changeListenerId);
              widgetInfo.changeListenerId = null;
            }
            if (evt.getData()) {
              widgetInfo.changeListenerId = evt.getData().addListener("change", onModified);
            }
          });
          widgetInfo.changeListenerId = widget["get" + upname]().addListener("change", onModified);
        };

        // If it's a List controller, then watch it's selection so that we can copy that to the value
        if (widget instanceof qx.data.controller.List) {
          this._miscController.addTarget(widget, "selection", bindPath, false);
          listenToSelectionChanges(widget, "selection");
        } else if (qx.Class.hasInterface(widget.constructor, qx.ui.form.IForm)) {
          let targetProperty = "value";
          if (qx.Class.hasInterface(widget.constructor, qx.ui.core.ISingleSelection) && qx.Class.hasInterface(widget.constructor, qx.ui.form.IModelSelection)) {
            listenToSelectionChanges(widget, "modelSelection");
            targetProperty = "modelSelection[0]";
          } else {
            widget.addListener("changeValue", this.__onWidgetModified.bind(this, widgetInfo));
          }

          this._miscController.addTarget(widget, targetProperty, bindPath, true, bindingOptions.options, bindingOptions.reverseOptions);

          this._resetter.add(widget);
        } else if (qx.Class.supportsEvent(widget.constructor, "changeValue")) {
          widget.addListener("changeValue", this.__onWidgetModified.bind(this, widgetInfo));
          this._miscController.addTarget(widget, "value", bindPath, false, bindingOptions.options, bindingOptions.reverseOptions);
        }

        // If no bind path, we still add a resetter
      } else if (qx.Class.hasInterface(widget.constructor, qx.ui.form.IForm)) {
        this._resetter.add(widget);
      }

      if (typeof widget.setTabIndex == "function") {
        // TabIndex
        if (options.tabIndex !== undefined) {
          widget.setTabIndex(options.tabIndex);
        } else widget.setTabIndex(++zx.ui.editor.FormEditor.__tabIndex);
      }
    },

    /**
     * Event handler for changes to widgets
     */
    async __onWidgetModified(widgetInfo, evt) {
      if (!this.inSetValue()) {
        this.setModified(true);
        await this.validateOne(widgetInfo.widget);
      }
    },

    /**
     * Called to update the display based on the widgets `valid` property
     *
     * @param {WidgetInfo} widgetInfo
     */
    __onWidgetChangeValid(widgetInfo) {
      let widget = widgetInfo.widget;
      let invalidMessageAtom = widgetInfo.invalidMessageAtom;
      if (widget.isValid()) {
        invalidMessageAtom.setVisibility("excluded");
      } else {
        invalidMessageAtom.set({
          visibility: "visible",
          label: widget.getInvalidMessage()
        });
      }
    },

    /**
     * Validates the form
     */
    async validate() {
      let numInvalid = 0;
      for (let groups = Object.values(this.__groups), groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        let group = groups[groupIndex];
        for (let widgetIndex = 0; widgetIndex < group.widgetInfos.length; widgetIndex++) {
          let widgetInfo = group.widgetInfos[widgetIndex];
          let message = await this.__runValidation(widgetInfo);
          if (message) {
            numInvalid++;
          }
        }
      }

      let message = await this._validateEditor();
      this.set({ valid: numInvalid == 0 && !message, invalidMessage: message });
    },

    /**
     * Runs the validation for only one widget
     *
     * @param {qx.ui.core.Widget} widget
     */
    async validateOne(widget) {
      let widgetInfo = this.__findWidgetInfoFor(widget);
      let message = await this.__runValidation(widgetInfo);

      let numInvalid = this.getInvalidFormTargets().length;

      message = await this._validateEditor();
      this.set({ valid: numInvalid == 0 && !message, invalidMessage: message });
    },

    /**
     * Called to validate the form; this can be overidden, the default implementation calls
     * the `validator` function (if provided)
     *
     * @returns {String?} the error message, if there is one
     */
    async _validateEditor() {
      let validator = this.getValidator();
      let message = null;
      if (validator) {
        message = await this.__runValidatorFunction(validator, this.getValue(), this);
      }
      return message;
    },

    /**
     * Runs the validation for a widgetInfo and returns the message (or null if validation passed)
     *
     * @param {WidgetInfo} widgetInfo
     * @returns {String?} null if no error
     */
    async __runValidation(widgetInfo) {
      let message = null;
      let widget = widgetInfo.widget;
      if (!(widget instanceof qx.ui.form.AbstractField)) {
        return;
      }
      let value = widget.getValue();

      if (typeof widget.isRequired == "function") {
        if (widget.isRequired() && widget.isEmptyField()) {
          message = widget.getRequiredInvalidMessage() || this.getRequiredFieldMessage();
        }
      }

      if (!message && widgetInfo.dataType) {
        message = await widgetInfo.dataType.validate(value, widget);
      }

      if (!message && widgetInfo.validator) {
        message = await this.__runValidatorFunction(widgetInfo.validator, value, widget);
      }

      if (!message && typeof widget.getValidator == "function") {
        let validator = widget.getValidator();
        if (validator) {
          message = await this.__runValidatorFunction(validator, value, widget);
        }
      }

      widget.set({ valid: !message, invalidMessage: message || null });

      return message;
    },

    /**
     * Runs a validator function, mapping `qx.core.ValidationError` exceptions to a string
     *
     * @param {Function} validator the validator function
     * @param {qx.core.Object} model the value to validate
     * @param {qx.ui.core.Widget} widget the widget that edited it
     * @returns {String?} error message if the field is invalid, else null
     */
    async __runValidatorFunction(validator, model, widget) {
      try {
        let message = await validator.call(this, model, widget);
        return message;
      } catch (ex) {
        if (ex instanceof qx.core.ValidationError) {
          if (ex.message && ex.message != qx.type.BaseError.DEFAULTMESSAGE) {
            return ex.message;
          }
          return ex.getComment();
        }
        throw ex;
      }
    },

    /**
     * Looks up the WidgetInfo for a given widget
     *
     * @param {qx.ui.core.Widget} widget
     * @returns {WidgetInfo}
     */
    __findWidgetInfoFor(widget) {
      for (let groups = Object.values(this.__groups), groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        let group = groups[groupIndex];
        for (let widgetIndex = 0; widgetIndex < group.widgetInfos.length; widgetIndex++) {
          let widgetInfo = group.widgetInfos[widgetIndex];
          if (widgetInfo.widget == widget) {
            return widgetInfo;
          }
        }
      }

      return null;
    },

    /**
     * Finds a list of invalid widgets
     *
     * @returns {qx.ui.core.Widget[]}
     */
    getInvalidFormTargets() {
      let result = [];
      for (let groups = Object.values(this.__groups), groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        let group = groups[groupIndex];
        for (let widgetIndex = 0; widgetIndex < group.widgetInfos.length; widgetIndex++) {
          let widgetInfo = group.widgetInfos[widgetIndex];
          if (typeof widgetInfo.widget.isValid == "function" && !widgetInfo.widget.isValid()) {
            result.push(widgetInfo.widget);
          }
        }
      }
      return result;
    },

    /**
     * Returns an array of all invalid messages of the invalid form items and
     * the form manager itself.
     *
     * @return {String[]} All invalid messages.
     */
    getInvalidMessages() {
      let result = this.getInvalidFormTargets().map(widget => widget.getInvalidMessage());
      let msg = this.getInvalidMessage();
      if (msg) {
        result.push(msg);
      }
      return result;
    },

    /**
     * Creates and returns the used resetter.
     *
     * @return {qx.ui.form.Resetter} the resetter class.
     */
    _createResetter() {
      return new qx.ui.form.Resetter();
    },

    /**
     * Resets the form. This means reseting all form items and the validation.
     */
    reset() {
      this._resetter.reset();
      for (let groups = Object.values(this.__groups), groupIndex = 0; groupIndex < groups.length; groupIndex++) {
        let group = groups[groupIndex];
        for (let widgetIndex = 0; widgetIndex < group.widgetInfos.length; widgetIndex++) {
          let widgetInfo = group.widgetInfos[widgetIndex];
          if (widgetInfo.widget instanceof qx.ui.form.AbstractField) {
            widgetInfo.widget.set({
              invalidMessage: null,
              valid: true
            });
          }
        }
      }
      this.set({
        invalidMessage: null,
        valid: true
      });
    },

    /**
     * Redefines the values used for resetting. It calls
     * {@link qx.ui.form.Resetter#redefine} to get that.
     */
    redefineResetter() {
      this._resetter.redefine();
    },

    /**
     * Redefines the value used for resetting of the given widget. It calls
     * {@link qx.ui.form.Resetter#redefineItem} to get that.
     *
     * @param widget {qx.ui.core.Widget} The widget to redefine.
     */
    redefineResetterItem(widget) {
      this._resetter.redefineItem(widget);
    },

    /**
     * Converts a value from the model to the widget
     *
     * @param widgetInfo the object containing data about the widget
     * @param value value to convert
     * @param model the model object
     * @returns the converted value
     */
    _convertToTarget(widgetInfo, value, model) {
      if (widgetInfo.convertToTarget) {
        value = widgetInfo.convertToTarget(value, model, widgetInfo);
      } else if (widgetInfo.dataType) {
        value = widgetInfo.dataType.convertToTarget(value, model, widgetInfo);
      }
      return value;
    },

    /**
     * Converts a value from the widget to the model
     *
     * @param widgetInfo the object containing data about the widget
     * @param value value to convert
     * @returns the converted value
     */
    _convertToModel(widgetInfo, value) {
      if (widgetInfo.convertToModel) {
        value = widgetInfo.convertToModel(value, widgetInfo);
      } else if (widgetInfo.dataType) {
        value = widgetInfo.dataType.convertToModel(value, widgetInfo);
      }
      return value;
    },

    /**
     * Callback for when the model updates the UI
     *
     * @param widgetInfo the object containing data about the widget
     * @param widget the widget
     * @param value value to convert
     */
    _onUpdateTarget(widgetInfo, widget, value) {
      if (!this.inSetValue()) {
        if (widgetInfo.onUpdateTarget) {
          widgetInfo.onUpdateTarget(widget, value, widgetInfo);
        }
      }
    },

    /**
     * Callback for when the UI updates the model
     *
     * @param widgetInfo the object containing data about the widget
     * @param value value to convert
     * @param model the model object
     */
    _onUpdateModel(widgetInfo, model, value) {
      if (!this.inSetValue()) {
        if (widgetInfo.onUpdateModel) {
          widgetInfo.onUpdateModel(model, value, widgetInfo);
        }
      }
    }
  },

  statics: {
    __tabIndex: 0
  }
});
