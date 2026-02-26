qx.Class.define("zx.reports.api.ServerReportDescriptor", {
  extend: qx.core.Object,
  implement: [zx.reports.api.IReportExecutor],

  construct(id, title, formats, reportRunner, createDatasource) {
    super();
    this.setId(id);
    this.setName(title);
    this.setFormats(formats);
    this.__reportRunner = reportRunner;
    this.__createDatasourceFn = createDatasource ?? this._createDataSource.bind(this);
    this.__serverApi = zx.io.api.ApiUtils.createServerApi(zx.reports.api.IReportExecutor, this);
  },

  destruct() {
    this.__serverApi.dispose();
    this.__serverApi = null;
  },

  properties: {
    id: {
      check: "String",
      event: "changeId"
    },

    name: {
      check: "String",
      event: "changeName"
    },

    hidden: {
      init: false,
      check: "Boolean",
      event: "changeHidden"
    },

    formats: {
      check: "Array",
      event: "changeFormats"
    },

    params: {
      init: null,
      check: "Object",
      event: "changeParams",
      nullable: true,
      apply: "_applyParams"
    }
  },

  members: {
    /** @type{Function} creates the datasource for a given set of parameters */
    __createDatasourceFn: null,

    /** @type{zx.reports.ReportRunner} the report runner */
    __reportRunner: null,

    /** @type{zx.report.IDatasource} the datasource */
    __datasource: null,

    /** @type{zx.io.api.server.AbstractServerApi} */
    __serverApi: null,

    /**
     *
     * @returns {zx.reports.ReportRunner}
     */
    _getReportRunner() {
      if (!this.__reportRunner) {
        this.__reportRunner = this._createReportRunner();
      }
      return this.__reportRunner;
    },

    /**
     * Apply for `params` property
     */
    async _applyParams(value, oldValue) {
      this.__datasource = await this.__createDatasourceFn(value);
    },

    getServerApi() {
      return this.__serverApi;
    },

    setRootElement(rootElement) {
      this._getReportRunner().setRootElement(rootElement);
    },

    /**
     * @Override
     */
    execute(format) {
      // window.myReportDescriptor = this; // for debugging purposes
      if (!this.getFormats().includes(format)) {
        throw new Error("Invalid format: " + format);
      }
      let reportRunner = this._getReportRunner();
      reportRunner.getIterator().setDatasource(this.__datasource);
      if (format === "html") {
        reportRunner.run();
      } else if (format === "csv") {
        return reportRunner.runCsv();
      } else {
        throw new Error("Unsupported format: " + format);
      }
    },

    /**
     * @Override
     */
    triggerPrintDialog() {
      document.execCommand("print", false, null);
    },

    /**
     * @Override
     */
    triggerSaveAsCsvDialog() {
      this.execute("csv");
    },

    /**
     * @Override
     */
    getDrilldown() {
      return this.__reportRunner.getIterator().getDrilldown();
    },

    /**
     * @Override
     */
    setGroupFilters(groupFilters) {
      this.__reportRunner.getIterator().setGroupFilters(groupFilters);
    },

    /**
     * @returns {zx.reports.ReportRunner}
     */
    _createReportRunner() {
      throw new Error(this.classname + " was neither initialized with a report runner nor implements the _createReportRunner method.");
    },

    /**
     *
     * @param {Object} params
     * @return {Promise<zx.reports.datasource.IDataSource>}
     */
    _createDataSource(params) {
      throw new Error(this.classname + " was neither initialized with a create datasource function nor implements the _createDataSource method.");
    }
  }
});
