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

/**
 * Runs a report, using the given iterator to generate the report, adds loading
 * message while the report is being generated, and then replaces the loading
 * message with the report
 *
 * @ignore(Blob)
 */
qx.Class.define("zx.reports.ReportRunner", {
  extend: qx.core.Object,

  construct(iterator) {
    super();
    this.__iterator = iterator;
  },

  properties: {
    cssClass: {
      check: "String",
      init: "spar-report"
    },

    header: {
      check: "qx.html.Element",
      init: null,
      nullable: true
    },

    footer: {
      check: "qx.html.Element",
      init: null,
      nullable: true
    },

    rootElement: {
      check: "qx.html.Element",
      init: null,
      nullable: true
    }
  },

  members: {
    /** @type{qx.html.Element} the element to output the report into */
    __rootElement: null,

    /** @type{zx.reports.IIterator} the report iterator */
    __iterator: null,

    /**
     * Runs the report; can be called multiple times, but if it is already
     * running, it will return the same promise as the first call
     */
    run() {
      let rootElement = this.getRootElement();
      if (!rootElement) {
        this.debug("ReportRunner has no rootElement set");
        return;
      }
      if (this.__runPromise) {
        return this.__runPromise;
      }
      let promise = this.__runImpl();
      promise = promise.then(
        () => {
          this.__runPromise = null;
        },
        () => {
          this.__runPromise = null;
        }
      );
      this.__runPromise = promise;
      return promise;
    },

    /**
     * Runs the report; this is the implementation of the run() method
     */
    async __runImpl() {
      let rootElement = this.getRootElement();
      if (!rootElement) {
        debugger;
        this.debug("ReportRunner has no rootElement set");
        return;
      }
      rootElement.removeAll();
      rootElement.setCssClass(this.getCssClass());
      this.jsx = uk.co.spar.reports.ci.util.Component;
      let loadingMessage = <this.jsx.LoadingWheel />;
      rootElement.add(loadingMessage);
      qx.html.Element.flush();

      try {
        let result = await this.__iterator.execute();
        let drilldown = await this.__iterator.getDrilldown();
        //console.log("Drilldown: ", JSON.stringify(drilldown, null, 2));
        rootElement.remove(loadingMessage);

        let reportElement = <div print-control></div>;
        if (this.getHeader()) {
          reportElement.add(this.getHeader());
        }

        let body = <div print-control-flow></div>;
        reportElement.add(body);
        body.add(result);
        if (this.getFooter()) {
          reportElement.add(this.getFooter());
        }

        rootElement.add(reportElement);
      } catch (e) {
        this.error(e);
        debugger;
        rootElement.removeAll();
        rootElement.add(
          <div>
            <p>An error occurred while generating the report.</p>
            <p>Retry by refreshing the page, or by returning to the previous page and confirming the correct details have been entered/selected.</p>
            <p>If the problem persists, please contact support.</p>
          </div>
        );
      }

      qx.html.Element.flush();
    },

    async runCsv() {
      let csv = await this.__iterator.executeAsCsv();
      let strData = zx.utils.Csv.stringify(csv);
      let filename = "report.csv"; //TODO use actual file name
      let blob = new Blob([strData], { type: "text/csv;charset=utf-8;" });
      let link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return strData;
    },

    /**
     * Returns the report iterator
     *
     * @returns {zx.reports.IIterator} the iterator
     */
    getIterator() {
      return this.__iterator;
    }
  }
});
