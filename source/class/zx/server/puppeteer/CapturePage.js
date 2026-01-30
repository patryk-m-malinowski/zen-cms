/**
 * This class is used to open a webpage using the Page API in Puppeteer
 * and captures the content of the page.
 *
 * This can be used for things like capturing one or more screenshots of a webpage,
 * printing the page to a PDF, or extracting data from the page.
 */
qx.Class.define("zx.server.puppeteer.CapturePage", {
  type: "static",

  statics: {
    /**
     * @typedef Options
     * @property {string} url URL of the page to to go. If not specified, falls abck to the worker's JSON URL
     * @property {Object} clientProperties Properties which will be set on the instance of zx.server.puppeteer.PuppeteerClient
     * @property {(pageInfo: {data: Object, ctlr: zx.server.puppeteer.PuppeteerWorkController}) => Promise<void>} onPageReady
     *  Callback called when the Page API fired the "pageReady" event,
     *  passed with an object containing the data posted from the page and the controller
     *
     * @param {zx.server.work.Worker} worker The worker instance
     * @param {Options} options
     */
    async execute(worker, options = {}) {
      let onPageReady = options.onPageReady;

      let json = worker.getWorkJson();

      let url = options.url ?? json.url;
      if (!url) {
        throw new Error("No url specified");
      }

      worker.appendWorkLog("Opening page at " + url);
      let ctlr = new zx.server.puppeteer.PuppeteerWorkController(worker, url, [zx.server.puppeteer.api.IPageApi], options.clientProperties);
      worker.appendWorkLog("Created PuppeteerWorkController");
      await ctlr.open();
      worker.appendWorkLog("Controller opened");
      let pageApi = ctlr.getClientApi(zx.server.puppeteer.api.IPageApi);

      await pageApi.subscribe("pageReady", async data => {
        worker.appendWorkLog("Received page ready event");
        await onPageReady({ data, ctlr });
        pageApi.next();
      });

      let promiseComplete = pageApi.whenNextSubscriptionFired("complete");
      pageApi.start();

      worker.appendWorkLog("Waiting for page to complete...");
      await promiseComplete;
      await pageApi.complete();
      worker.appendWorkLog("Page completed");
      await ctlr.close();
      worker.appendWorkLog("Controller closed");
      ctlr.dispose();
    }
  }
});
