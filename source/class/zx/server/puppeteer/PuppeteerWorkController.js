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

qx.Class.define("zx.server.puppeteer.PuppeteerWorkController", {
  extend: qx.core.Object,

  construct(worker, url, apiInterfaces, clientProperties) {
    super();
    this.__clientApis = {};
    this.__url = url;
    this.__clientProperties = clientProperties;
    for (let ifc of apiInterfaces) {
      this.__clientApis[ifc.name] = null;
    }
    this.__worker = worker;
  },

  properties: {
    enableDebug: {
      init: false,
      check: "Boolean"
    }
  },

  members: {
    /** @type {zx.server.work.IWorker} the worker we're operating for */
    __worker: null,

    /** @type {zx.server.puppeteer.PuppeteerClientTransport} the client transport for talking to APIs in Chromium */
    __transport: null,

    /** @type {Object<String, zx.io.api.client.AbstractClientApi} Client APIs */
    __clientApis: null,

    /** @type {zx.server.puppeteer.PuppeteerClient} the PuppeteerClient for the page we are controlling */
    __puppeteerClient: null,

    /**
     *
     * @returns {zx.server.puppeteer.PuppeteerClientTransport}
     */
    getTransport() {
      return this.__transport;
    },

    /**
     * Finds a Client API for a given interface
     *
     * @param {Interface} ifc
     * @returns {zx.io.api.client.AbstractClientApi}
     */
    getClientApi(ifc) {
      return this.__clientApis[ifc.name];
    },

    /**
     * The Puppeteer Client
     *
     * @returns {zx.server.puppeteer.PuppeteerClient}
     */
    getPuppeteerClient() {
      return this.__puppeteerClient;
    },

    /**
     * Initialises and connects to Chromium
     */
    async open() {
      let json = this.__worker.getWorkJson();
      if (!this.__url) {
        throw new Error("No URL specified");
      }
      this.debug(`Executing for url ${this.__url}: ` + JSON.stringify(json, null, 2));

      let chromium = await this.__worker.getChromium();

      let debugOnStartup = !!json.debugOnStartup || this.getEnableDebug();
      if (qx.core.Environment.get(this.classname + ".askDebugOnStartup")) {
        // you may want to set `debugOnStartup` to `true`
        debugger;
      }

      let clientProperties = json.clientProperties || {};
      if (this.__clientProperties) {
        clientProperties = { ...clientProperties, ...this.__clientProperties };
      }

      let puppeteerClient = new zx.server.puppeteer.PuppeteerClient().set({
        url: this.__url,
        debug: this.getEnableDebug(),
        debugOnStartup: debugOnStartup,
        chromiumEndpoint: chromium.getEndpoint(),
        usesZxApi: true,
        ...clientProperties
      });
      puppeteerClient.addListener("log", evt => {
        this.__worker.appendWorkLog(evt.getData().msg);
        evt.preventDefault();
      });

      this.debug("Puppeteer client created");
      this.__puppeteerClient = puppeteerClient;

      try {
        // This can throw an exception if the URL is refused or other reasons
        await puppeteerClient.start();
        this.debug("Puppeteer client started");
      } catch (ex) {
        try {
          await puppeteerClient.stop();
          puppeteerClient.dispose();
        } catch (ex2) {
          this.error("Exception in closeDown after exception: " + (ex2.stack || ex2));
        }
        throw ex;
      }

      this.__transport = new zx.server.puppeteer.PuppeteerClientTransport(puppeteerClient.getPage());
      if (Object.keys(this.__clientApis).length) {
        for (let apiName in this.__clientApis) {
          let ifc = qx.Interface.getByName(apiName);
          let api = zx.io.api.ApiUtils.createClientApi(ifc, this.__transport);
          this.__clientApis[apiName] = api;
        }
      }

      puppeteerClient.addListenerOnce("close", () => this.close());

      await puppeteerClient.waitForReadySignal();
    },

    /**
     * Closes the connection to Chromium/Puppeteer
     */
    async close() {
      if (this.__transport) {
        this.__transport.shutdown();
        this.__transport = null;
      }
      if (this.__puppeteerClient) {
        let puppeteerClient = this.__puppeteerClient;
        this.__puppeteerClient = null;
        await puppeteerClient.stop();
        puppeteerClient.dispose();
      }
      this.debug("Puppeteer client closed");
    }
  }
});
