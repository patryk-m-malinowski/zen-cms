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

const fs = require("fs");
const path = require("path");
const ip = require("ip");
const rotatingFileStream = require("rotating-file-stream");
const { AsyncLocalStorage } = require("async_hooks");

/**
 * The Web Server
 *
 * @use(zx.cms.app.auth.LoginFormFeature)
 * @use(zx.cms.app.auth.LogoutFeature)
 * @ignore(Buffer)
 */
qx.Class.define("zx.server.WebServer", {
  extend: zx.server.Standalone,
  implement: [zx.io.api.server.IAuthProvider],

  properties: {
    /** Port to listen on */
    listenPort: {
      init: 8080,
      nullable: false,
      check: "Integer"
    },

    /** HTTPS port to listen on */
    sslListenPort: {
      init: 8488,
      nullable: false,
      check: "Integer"
    },

    /** Whether to provide an SSL listener */
    sslEnabled: {
      init: false,
      nullable: false,
      check: "Boolean"
    },

    /** The SSL certificate */
    sslCertificate: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeSslCertificate"
    },

    /** The SSL key */
    sslPrivateKey: {
      init: null,
      nullable: true,
      check: "String",
      event: "changeSslPrivateKey"
    },

    /** Set to true if behind a proxy and X-Forwarded-For can be trusted */
    trustProxy: {
      init: false,
      check: "Boolean",
      event: "changeTrustProxy"
    },

    /** Filename to log accesses to */
    accessLog: {
      init: null,
      nullable: true,
      check: "String"
    }
  },

  members: {
    /** @type{Fastify} the application */
    _app: null,

    /** @type{zx.io.remote.NetworkController} controller for IO with the browsers */
    _networkController: null,

    /** Stream to write access logs to, may be null */
    __accessLogStream: null,

    /** @type{String[]} list of allowed subnets */
    __validSubnets: null,

    /**
     * @typedef {Object} AlsRequestContext
     * @property {import("fastify").FastifyRequest} request
     * @property {import("fastify").FastifyReply} reply
     *
     * @type{AsyncLocalStorage<AlsRequestContext>} used for the current request/reply
     */
    __alsRequest: null,

    /** @type{zx.server.SessionManager} the session manager */
    __sessionManager: null,

    /** @type{Object[]} array of objects describing url rules */
    __urlRules: null,

    /** @type{zx.utils.PublicPrivate} the proxy servers encryption, used for remote authentication */
    __proxyPublicPrivate: undefined,

    /** @type{zx.server.work.scheduler.QueueScheduler} the scheduler, if configured */
    __workScheduler: null,

    /**
     * Called to start the server
     */
    async start() {
      await super.start();
      if (this._config.createProxies) {
        let proxiesOutputPath = this._config.createProxies?.outputPath;
        if (proxiesOutputPath) {
          let compilerTargetPath = this._config.createProxies?.compilerTargetPath;
          if (!compilerTargetPath) {
            throw new Error("Missing compilerTargetPath in cms.json/createProxies");
          }
          let ctlr = new zx.io.remote.proxy.ClassesWriter().set({
            outputPath: proxiesOutputPath,
            compilerTargetPath: compilerTargetPath
          });

          await ctlr.writeAllProxiedClasses();
        }
      }
      await this._startServer();
      await this._registerUrls();
    },

    /**
     * @Override
     */
    async stop() {
      this._app.close();
      await super.stop();
    },

    /**
     * Creates and starts the web server
     * @ignore(process)
     */
    async _startServer() {
      // We either trust the proxy server, in which case we require it to be on a local subnet, or
      //  we dont trust the proxy server in which case it must be a private IP range
      const os = require("os");
      let trustProxy = this.isTrustProxy();
      const ifaces = os.networkInterfaces();
      this.__validSubnets = [];

      // Build list of valid subnets
      Object.keys(ifaces).forEach(ifname => {
        ifaces[ifname].forEach(iface => {
          if (!iface.internal) {
            this.__validSubnets.push(ip.cidrSubnet(iface.cidr));
          }
        });
      });

      let accessLog = this.getAccessLog();
      if (accessLog) {
        this.__accessLogStream = rotatingFileStream.createStream(path.basename(accessLog), {
          size: "50M",
          interval: "1d",
          path: path.dirname(accessLog)
        });
      }

      let app = await this._createApplication();

      try {
        await app.listen({
          port: this.getListenPort(),
          host: "0.0.0.0"
        });
      } catch (err) {
        console.error("Error when starting the server: " + err);
        process.exit(1);
      }

      console.log(`Webserver started on http://localhost:${this.getListenPort()}`);
    },

    /**
     * Called to register URLs for the network IO
     *
     * @returns {zx.server.Configuration} the master configuration for the user
     */
    async _registerUrls() {
      let config = this._createCmsConfiguration();
      await config.initialise();
      this._networkController.putUriMapping("zx.server.CmsConfiguration", config);
      this._networkController.putUriMapping("zx.server.auth.LoginApi", new zx.server.auth.LoginApi());

      config.registerApi(zx.server.auth.LoginApi);
      config.registerApi(zx.server.auth.LoginApiAdmin, null, "zx-super-user");
      return config;
    },

    /**
     * Called to register optional apis
     *
     * @param {zx.server.CmsConfiguration} cmsConfig
     */
    _registerOptionalUrls(cmsConfig) {
      cmsConfig.registerApi("zx.server.email.EmailApi", zx.server.email.EmailApi);
    },

    /**
     * Creates an instance of zx.server.CmsConfiguration
     *
     * @returns {zx.server.CmsConfiguration}
     */
    _createCmsConfiguration() {
      return new zx.server.CmsConfiguration();
    },

    /**
     * Creates the Fastify application
     *
     * @return {Fastify}
     */
    async _createApplication() {
      if (this._app) {
        return this._app;
      }
      let maxFileUploadSize = this._config.uploads?.maxFileUploadSize || 10 * 1024 * 1024;
      let options = {
        logger: false
      };

      if (this._config.logging) {
        options.logger = qx.lang.Object.mergeWith(
          {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname"
              }
            }
          },

          this._config.logging
        );
      }
      if (this.isSslEnabled()) {
        options.https = {
          key: this.getSslPrivateKey(),
          cert: this.getSslCertificate()
        };

        options.http2 = true;
      }
      if (this.isTrustProxy()) {
        options.trustProxy = true;
      }
      const app = (this._app = require("fastify")(options));
      app.register(require("@fastify/cookie"));
      app.register(require("@fastify/multipart"), {
        limits: {
          fieldNameSize: 100, // Max field name size in bytes
          fieldSize: 512, // Max field value size in bytes
          fields: 10, // Max number of non-file fields
          fileSize: maxFileUploadSize, // For multipart forms, the max file size in bytes
          files: 10, // Max number of file fields
          headerPairs: 2000 // Max number of header key=>value pairs
        }
      });

      app.addContentTypeParser("application/json", { parseAs: "string" }, function (req, body, done) {
        try {
          var json = zx.utils.Json.parseJson(body);
          done(null, json);
        } catch (err) {
          err.statusCode = 400;
          done(err, undefined);
        }
      });

      app.setReplySerializer(function (payload, statusCode) {
        let str = zx.utils.Json.stringifyJson(payload, null, 2);
        return str;
      });

      await this._initSessions(app);
      await this._initApplication(app);
      await this._initApis(app);
      await this._initWorkScheduler();
      await this._initUrlRules();

      return app;
    },

    /**
     * Initialises the sessions middleware
     *
     * @param app {Fastify}
     */
    async _initSessions(app) {
      let sessionConfig = this._config.session || {};
      if (!sessionConfig.secret) {
        this.warn("Using default secret for signing sessions - please set session.secret in the configuration");
      }
      if (sessionConfig.secret.length < 32) {
        this.warn("session.secret in the configuration is too short, it should be at least 32 characters");
        sessionConfig.secret = null;
      }

      let databaseConfig = this._config.database.mongo;
      let manager = (this.__sessionManager = new zx.server.SessionManager(databaseConfig.uri, databaseConfig.databaseName, "zx.server.WebServer.sessions"));
      manager.set({
        secret: sessionConfig.secret || "yHbUWDFyEKikhuXgqzkgjxj7gBwZ6Ahm",
        cookieName: "zx.cms.sessionId",
        cookieOptions: {
          maxAge: 5 * 24 * 60 * 60 * 1000,
          sameSite: "strict",
          // This needs to be false unless on HTTPS (otherwise cookies will not be sent by @fastify/session)
          secure: false //sessionConfig.secureCookie === false ? false : true
        }
      });

      await manager.open();
      manager.registerWithFastify(app);
    },

    /**
     * Runs the function with a given request context
     *
     * The caller of this method MUST catch exceptions, which may be an instanceof zx.utils.Http.HttpError
     *
     * @param {AlsRequestContext} context
     * @param {Function} fn
     * @return {*}
     * @throws {zx.utils.Http.HttpError}
     */
    async runInRequestContext(context, fn) {
      this._requestContext.set("context", context);
      let result;
      try {
        result = await fn();
      } finally {
        this._requestContext.set("context", null);
      }
      return result;
    },

    /**
     * Returns the request context, an object that contains `request` and `reply`
     *
     * @returns {AlsRequestContext}
     */
    getRequestContext() {
      //let store = this.__alsRequest.getStore();
      let store = this._requestContext.get("context");
      if (!store) {
        throw new Error("Cannot get request context outside of the request");
      }
      return store;
    },

    /**
     * Wraps a middleware function so that it can run in a request context and
     * exeptions are handled gracefully
     *
     * @param {Function} fn
     * @returns {Function} the wrapped function
     */
    wrapMiddleware(fn) {
      return async (req, reply) => {
        try {
          let result = await this.runInRequestContext({ request: req, reply: reply }, () => fn(req, reply));
          await reply;
        } catch (ex) {
          if (ex instanceof zx.utils.Http.HttpError) {
            if (ex.statusCode < 400 || ex.statusCode >= 500) {
              this.error(`Exception raised:\n${ex.fullMessage || ex.message}`);
            }
            await this.sendErrorPage(req, reply, ex.statusCode, ex.message);
          } else {
            this.error(`Exception raised:\n${ex.fullMessage || ex.message}`);
            await this.sendErrorPage(req, reply, 500, ex.message);
          }
        }
        return reply;
      };
    },

    /**
     * Initialises the Fastify
     *
     * @param {import("fastify").FastifyInstance} app
     */
    async _initApplication(app) {
      const fastifyStatic = require("@fastify/static");
      const { fastifyRequestContextPlugin, requestContext } = require("@fastify/request-context");
      this._requestContext = requestContext;
      zx.io.remote.NetworkEndpoint.requestContext = requestContext;

      app.register(fastifyRequestContextPlugin, {
        hook: "preValidation",
        defaultStoreValues: {
          user: { id: "system" }
        }
      });

      app.register(require("@fastify/formbody"));
      app.decorateReply("json", function (payload) {
        this.code(200).header("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(payload, null, 2));
        return this;
      });
      app.decorateReply("text", function (payload) {
        this.code(200).type("plain/text").send(payload);
        return this;
      });
      app.decorateReply("notFound", function (message) {
        this.code(404)
          .type("plain/text")
          .send(message || "Not found");
        return this;
      });
      app.decorateReply("serverError", function (message) {
        this.code(500)
          .type("plain/text")
          .send(message || "Internal Error");
        return this;
      });

      const send = require("@fastify/send");
      app.decorateReply("sendFileAbsolute", function (filename) {
        if (filename == null) {
          throw new Error("Calling sendFileAbsolute with null filename");
        }

        send(this.request.raw, filename).pipe(this.raw);
        return this;
      });

      //this.__alsRequest = new AsyncLocalStorage();

      app.addHook("onSend", async (request, reply, payload) => {
        reply.removeHeader("X-Powered-By");
        return payload;
      });

      app.addHook("onRequest", async (request, reply) => {
        try {
          await this._onRequestHook(request, reply);
        } catch (ex) {
          this.error("Exception during _onRequestHook: " + ex);
          throw ex;
        }
      });

      // Map to Qooxdoo compiled resources
      let targets = this._config.targets || {};
      app.register(fastifyStatic, {
        root: zx.server.Config.resolveApp("compiled", targets.browser || "source"),
        prefix: "/zx/code"
      });

      app.register(fastifyStatic, {
        root: zx.server.Config.resolveApp("node_modules/medium-editor/dist"),
        prefix: "/zx/extra/medium-editor",
        decorateReply: false
      });

      app.get(
        "/zx/impersonate/:shortCode",
        this.wrapMiddleware(async (req, reply) => await this.__impersonate(req, reply))
      );

      app.get(
        "/zx/shorturl/:shortCode",
        this.wrapMiddleware(async (req, reply) => await this.__shortUrl(req, reply))
      );

      app.get(
        "/zx/blobs/:uuid",
        this.wrapMiddleware(async (req, reply) => await this.__blobs(req, reply))
      );

      app.get(
        "/zx/theme/*",
        this.wrapMiddleware(async (req, reply) => await this._renderer.getTheme().middleware(req, reply))
      );

      // Configured static paths
      if (this._config.statics) {
        for (let static of this._config.statics) {
          if (typeof static == "string") {
            static = { path: static };
          }
          if (!static.path) {
            this.error(`No path specified for static: ${JSON.stringify(static)}`);
            continue;
          } else {
            let root = zx.server.Config.resolveApp(static.path);
            let prefix = static.url || static.path;
            if (prefix[0] != "/") {
              prefix = "/" + prefix;
            }
            app.register(fastifyStatic, { root, prefix, decorateReply: false });
          }
        }
      }

      // REST API
      const ARAS = zx.server.rest.RestApiServer;
      app.route({
        method: ["GET", "POST"],
        url: ARAS.getEndpoint(),
        handler: this.wrapMiddleware(ARAS.middleware)
      });

      // zx.io.remote
      this._networkController = new zx.io.remote.NetworkController();
      let xhrListener = new zx.io.remote.FastifyXhrListener(this._networkController);
      app.route({
        method: ["GET", "POST"],
        url: "/zx/io/xhr",
        handler: this.wrapMiddleware(async (req, reply) => await xhrListener.middleware(req, reply))
      });

      await this._initExtraPaths(app);

      app.get(
        "*",
        this.wrapMiddleware(async (req, reply) => await this._defaultUrlHandler(req, reply))
      );
      app.get(
        "/",
        this.wrapMiddleware(async (req, reply) => await this._defaultUrlHandler(req, reply))
      );
    },

    /**
     * Called to allow implementations to add extra paths, just before the default catch all is installed
     *
     * @param {Fastify} app
     */
    async _initExtraPaths(app) {
      // Nothing
    },

    /**
     * Initialises the schedule and Worker pool
     */
    async _initWorkScheduler() {
      let config = this._config.work;
      if (!config?.pool) {
        this.error("No work configuration found in cms.json");
        return;
      }
      await zx.server.email.FlushQueue.createTask();
      let workerCliPath = config.workerCliPath;
      let poolType = config.pool.type || "local";
      let poolConfig = {
        minSize: config.pool.minSize || 1,
        maxSize: config.pool.maxSize || 1
      };
      let pool = null;

      if (poolType == "local") {
        pool = new zx.server.work.pools.LocalWorkerPool().set({
          poolConfig
        });
      } else if (poolType == "node-thread") {
        if (!workerCliPath) {
          throw new Error("workerCliPath must be specified in cms.json work configuration for node-thread and node-process worker pools");
        }
        pool = new zx.server.work.pools.NodeThreadWorkerPool(null, workerCliPath).set({
          poolConfig
        });
      } else {
        if (!workerCliPath) {
          throw new Error("workerCliPath must be specified in cms.json work configuration for node-thread and node-process worker pools");
        }
        let settings = {
          poolConfig,
          nodeInspect: config.inspect || "none",
          nodeLocation: "host"
        };

        settings.hostNodeCommand = [workerCliPath, `work`, `start-worker`];

        if (poolType == "node-process") {
          settings.nodeLocation = "host";
        } else if (poolType == "docker") {
          settings.nodeLocation = "container";
        } else {
          throw new Error("Unknown pool type: " + poolType);
        }
        pool = new zx.server.work.pools.NodeProcessWorkerPool().set(settings);
      }
      if (qx.core.Environment.get("qx.debug")) {
        let dockerMounts = pool.getDockerMounts() || [];
        dockerMounts.push(`compiled/source-node:/home/pptruser/app/runtime`);
        pool.setDockerMounts(dockerMounts);
      } else {
        let dockerMounts = pool.getDockerMounts() || [];
        dockerMounts.push(`compiled/build-node:/home/pptruser/app/runtime`);
        pool.setDockerMounts(dockerMounts);
      }
      if (config.extraHosts) {
        pool.setDockerExtraHosts(config.extraHosts);
      }

      if (config.enableChromium !== false) {
        pool.setEnableChromium(true);
      }
      this._configureWorkPool(pool);

      await pool.cleanupOldContainers();

      let workScheduler = new zx.server.work.scheduler.QueueScheduler("temp/scheduler/");
      workScheduler.addPool(pool.getDescriptionJson());

      let cm = zx.io.api.server.ConnectionManager.getInstance();
      let dbScanner = new zx.server.work.scheduler.DbScanner(workScheduler);
      cm.registerApi(dbScanner.getServerApi(), "/tasks");
      await fs.promises.rm(pool.getWorkDir(), { force: true, recursive: true });
      await fs.promises.rm(workScheduler.getWorkDir(), { force: true, recursive: true });

      cm.registerApi(workScheduler.getServerApi(), "/scheduler");

      let schedulerClientApi = zx.io.api.ApiUtils.createClientApi(zx.server.work.scheduler.ISchedulerApi, zx.io.api.ApiUtils.getClientTransport(), "/scheduler");
      pool.setSchedulerApi(schedulerClientApi);

      await pool.startup();
      await workScheduler.startup();
      dbScanner.start();
      this.__workScheduler = workScheduler;
    },

    /**
     * Provides an opportunity to configure the worker pool, prior to starting it
     *
     * @param {zx.server.work.pools.WorkerPool} pool
     */
    async _configureWorkPool(pool) {
      // Nothing
    },

    getWorkScheduler() {
      return this.__workScheduler;
    },

    /**
     * Called to initialise the url rule handling
     */
    _initUrlRules() {
      let site = this.getSite();
      this.__urlRules = [];
      site.getUrlRules().forEach(rule => {
        let data = {
          match: null,
          type: "exact",
          rule: rule
        };

        if (!rule.getIsRegEx()) {
          data.match = rule.getUrl().toLowerCase();
        } else {
          data.match = new RegExp(rule.getUrl());
          data.type = "regex";
        }
        data.rule = rule;
        this.__urlRules.push(data);
      });
    },

    /**
     * Fastify hook to check for appropriate URL rules
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     */
    async _onRequestHook(request, reply) {
      if (!this.isTrustProxy()) {
        if (!ip.isPrivate(request.ip)) {
          reply.code(403);
          return;
        }
      } else {
        if (!this.__validSubnets.some(subnet => subnet.contains(request.ip))) {
          reply.code(403);
          return;
        }
      }

      await this._handleProxyLogin(request, reply);

      let url = request.url.toLowerCase();
      let pos = url.indexOf("?");
      let query = "";
      if (pos > -1) {
        query = url.substring(pos);
        url = url.substring(0, pos);
      }
      if (url.length == 0) {
        url = "/index.html";
      } else if (url[url.length - 1] == "/") {
        url += "index.html";
      }

      const takeActionImpl = async (action, redirectTo, customActionCode) => {
        if (action === null) {
          return;
        }

        switch (action) {
          case "blockNotFound":
            reply.code(404);
            return;

          case "redirectTemporary":
            reply.redirect(redirectTo, 302);
            return;

          case "redirectPermanent":
            reply.redirect(redirectTo, 301);
            return;

          case "redirectInternally":
            await this._defaultUrlHandler(request, reply, redirectTo + query);
            return;

          case "custom":
            await this._handleCustomAction(customActionCode);
        }
      };

      let matches = [];
      for (let i = 0; i < this.__urlRules.length; i++) {
        let data = this.__urlRules[i];
        let rule = data.rule;
        if (data.type == "exact") {
          if (url != data.match) {
            continue;
          }
        } else {
          if (!data.match.test(url)) {
            continue;
          }
        }

        // A denied rule is a hard stop
        if (await rule.isDenied(request)) {
          await takeActionImpl(rule.getDeniedAction(), rule.getDeniedRedirectTo(), rule.getDeniedCustomActionCode());
          return;
        }

        // A granted rule, may or may not have an action;
        if (await rule.isGranted(request)) {
          let action = rule.getGrantedAction();
          if (action && action != "allow") {
            await takeActionImpl(action, rule.getGrantedRedirectTo(), rule.getGrantedCustomActionCode());
            return;

            // An "allow" action short circuits the rest of the checks
          } else if (action == "allow") {
            break;
          }
        }

        matches.push(rule);
      }

      let cachability = null;
      let cacheRevalidation = null;
      let maxAge = null;
      matches.forEach(rule => {
        if (cachability === null) {
          let tmp = rule.getCachability();
          if (tmp !== null) {
            cachability = tmp;
          }
        }

        if (cacheRevalidation === null) {
          let tmp = rule.getCacheRevalidation();
          if (tmp !== null) {
            cacheRevalidation = tmp;
          }
        }

        if (maxAge === null) {
          let tmp = rule.getMaxAge();
          if (tmp !== null) {
            maxAge = tmp;
          }
        }
      });

      let directives = [];
      if (cachability !== null) {
        directives.push(cachability);
      }
      if (cacheRevalidation !== null) {
        directives.push(cacheRevalidation);
      }
      if (maxAge !== null && maxAge >= 0) {
        directives.push("max-age=" + maxAge);
      }

      if (directives.length) {
        reply.header("Cache-Control", directives.join(", "));
      }
    },

    /**
     * Handles login as instructed by the proxy server, required X-Authorization and X-Authorisation-Signature
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     * @returns {Boolean} whether the user was changed
     */
    async _handleProxyLogin(request, reply) {
      let auth = request.headers["x-authorization"];
      let authSignature = request.headers["x-authorization-signature"];

      if (auth && auth.startsWith("Proxy")) {
        if (this.__proxyPublicPrivate === undefined) {
          if (this._config.proxyPrivateKeyFile) {
            this.__proxyPublicPrivate = new zx.utils.PublicPrivate();
            await this.__proxyPublicPrivate.init(this._config.proxyPrivateKeyFile);
          } else {
            this.__proxyPublicPrivate = null;
          }
        }

        let payload = auth.substring("Proxy".length).trim();
        payload = Buffer.from(payload, "base64");
        authSignature = Buffer.from(authSignature, "base64");
        let email = payload.toString("utf8");

        if (!this.__proxyPublicPrivate) {
          this.error("Not logging in user " + email + " because no public key");
          reply.code(403);
          return false;
        }

        let verified = this.__proxyPublicPrivate.verify(payload, authSignature);

        if (!verified) {
          this.error("Not logging in user " + email + " because signature is invalid");
          reply.code(403);
          return false;
        }

        let currentUser = await zx.server.auth.User.getUserFromSession(request);
        if (currentUser && currentUser.getUsername().toLowerCase() != email.toLowerCase()) {
          await this.__sessionManager.disposeSession(request);
          this.__sessionManager.newSession(request);
          currentUser = null;
        }

        if (!currentUser) {
          let user = await this.getUserDiscovery().getUserFromEmail(email, true);
          if (user) {
            if (!request.session) {
              this.__sessionManager.newSession(request);
            }
            user.login(request);

            let session = request.session;

            // This causes the session to be cached in memopry
            session.addUse();
            currentUser = user;

            session.getAuthenticatedApis().removeAll();
            session.getAuthenticatedApis().replace(user.getApiTokens().getKeys().copy());
          }
        }

        return !!currentUser;
      }

      return false;
    },

    /**
     * Handler for impersonate URL
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     */
    async __impersonate(request, reply) {
      let shortUrl = await zx.cms.website.ShortUrl.getShortUrlByShortCode(request.params.shortCode);
      if (!shortUrl || shortUrl.getType() != "impersonate") {
        this.sendErrorPage(request, reply, 404);
        return;
      }
      await shortUrl.deleteFromDatabase();

      let data = JSON.parse(shortUrl.getValue());
      let oldest = zx.utils.Dates.addMinutes(new Date(), -15);
      if (!data || data.timeNow < oldest.getTime()) {
        this.sendErrorPage(request, reply, 404, "Expired");
        return;
      }

      let currentUser = await zx.server.auth.User.getUserFromSession(request);
      if (currentUser && currentUser.getUsername().toLowerCase() != data.username.toLowerCase()) {
        await this.__sessionManager.disposeSession(request);
        this.__sessionManager.newSession(request);
        currentUser = null;
      }

      if (!currentUser) {
        let user = await this.getUserDiscovery().getUserFromEmail(data.username);
        if (user != null) {
          if (!request.session) {
            this.__sessionManager.newSession(request);
          }
          user.login(request, false);
        }
      }
      reply.redirect(data.redirectTo || "/");
    },

    /**
     * Handler for short URLs
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     */
    __shortUrl(request, reply) {},

    /**
     * Handler for Blobs
     *
     * @param {import("fastify").FastifyRequest} request
     * @param {import("fastify").FastifyReply} reply
     */
    __blobs(request, reply) {
      let uuid = request.params.uuid.toLowerCase();
      let pos = uuid.lastIndexOf(".");
      let ext = uuid.substring(pos);
      uuid = uuid.substring(0, pos);
      let filename = this.getBlobFilename(uuid) + ext;
      return reply.sendFile(filename, ".");
    },

    /**
     * Called to handle a custom action for a url rule
     *
     * @param {import("fastify").FastifyRequest} req
     * @param {import("fastify").FastifyReply} reply
     * @param {String} customCode
     */
    async _handleCustomAction(req, reply, customCode) {
      this.error(`No action to perform for customCode ${customCode} for ${req.url}`);
      this.sendErrorPage(req, reply, 404);
    },

    /**
     * Attempts to get a hash from a url and appends it to the url as a query string; this
     * is used in the html layouts so that URLs to files which are generated can include
     * something to make them unique and cache-busting.  This approach allows long cache
     * expiry headers to be used (with immutable, where supported) but also guarantees that
     * changes are seen by the browser.
     *
     * @param {String} url
     * @returns {String} the modified url, or the same url if there is no change to be had
     */
    getUrlFileHash(url) {
      function addHash(filename) {
        let stat = fs.statSync(filename, { throwIfNoEntry: false });
        if (!stat) {
          return url;
        }
        let pos = url.indexOf("?");
        if (pos > -1) {
          url += "&";
        } else url += "?";
        url += stat.mtimeMs;
        return url;
      }

      if (url.startsWith("/zx/code/")) {
        let targets = this._config.targets || {};
        let tmp = url.substring(9);
        tmp = zx.server.Config.resolveApp("compiled", targets.browser || "source", tmp);
        return addHash(tmp);
      } else if (url.startsWith("/zx/theme/")) {
        let tmp = url.substring(10);
        tmp = this._renderer.getTheme().resolveSync(tmp);
        if (tmp) {
          return addHash(tmp);
        }
      }

      return url;
    },

    /**
     * Returns the controller for remote I/O with the clients
     *
     * @returns {zx.io.persistence.NetworkController}
     */
    getNetworkController() {
      return this._networkController;
    },

    /**
     * Returns the session manager
     *
     * @returns {zx.server.SessionManager}
     */
    getSessionManager() {
      return this.__sessionManager;
    },

    /**
     * Called to initialise APIs
     */
    async _initApis(app) {
      let cm = zx.io.api.server.ConnectionManager.getInstance();
      cm.setAuthProvider(this);
      this._apiTransport = new zx.io.api.transport.http.FastifyServerTransport(app, cb => this.wrapMiddleware(cb));
    },

    /**
     * The handler for urls
     */
    async _defaultUrlHandler(req, reply, url) {
      if (!url) {
        url = req.url;
      }

      let pos = url.indexOf("?");
      if (pos > -1) {
        url = url.substring(0, pos);
      }

      // Normalise the path
      if (url[url.length - 1] == "/") {
        url += "index.html";
      }

      // Get the page
      if (url.endsWith(".html")) {
        let dbUrl = (url = "pages" + url.replace(".json", ""));
        let object = await this.getObjectByUrl(zx.cms.content.Page, dbUrl);
        if (!object) {
          throw new zx.utils.Http.HttpError(404, `Cannot find ${url}`);
        }

        let rendering = new zx.cms.render.FastifyRendering(req, reply);
        try {
          await this._renderer.renderViewable(rendering, object);
        } catch (ex) {
          throw new zx.utils.Http.HttpError(500, ex);
        }
        return;
      } else if (url.endsWith(".csv")) {
        let dbUrl = (url = "pages" + url.substring(0, url.length - 4));
        let object = await this.getObjectByUrl(zx.cms.content.CsvDownload, dbUrl);
        if (!object) {
          throw new zx.utils.Http.HttpError(404, `Cannot find ${url}`);
        }

        try {
          await object.generate(req, reply);
        } catch (ex) {
          throw new zx.utils.Http.HttpError(500, ex);
        }
        return;
      }

      // Oops
      throw new zx.utils.Http.HttpError(404, `Cannot find ${url}`);
    },

    /**
     * Adds an entry to the access log stream, if one is configured; the log is the date/time
     * plus a comma separated list of arguments
     */
    logAccess(...args) {
      if (this.__accessLogStream) {
        let dt = new Date();
        args = args.filter(arg => arg !== undefined).map(arg => (arg === null ? "" : `"${arg}"`));
        let str = [dt.toUTCString(), ...args].join(",");
        this.__accessLogStream.write(str + "\n");
      }
    },

    /**
     * Sends an error page
     */
    async sendErrorPage(req, reply, statusCode, message) {
      if (statusCode == 200) {
        throw new Error("Invalid status code 200!");
      }
      let rendering = new zx.cms.render.FastifyRendering(req, reply);
      await this._renderer.renderSystemPage(rendering, statusCode, {
        statusCode,
        message
      });
    },

    /**
     * Outputs a console method if debug is enabled
     */
    debug(msg) {
      if (this.getEnableDebug()) {
        console.log(msg);
      }
    },

    /**@override */
    async canUseApi(apiName) {
      //if we have a session, check if the API is authenticated
      let request = zx.server.WebServer.getCurrentRequest();
      let session = request.session;
      if (session && session.getAuthenticatedApis().includes(apiName)) {
        return true;
      }

      //try to get the user from basic auth header
      let auth = request.headers["authorization"];
      if (!auth || !auth.startsWith("Basic ")) {
        return false;
      }

      let encoded = auth.substring("Basic ".length);
      let decoded = atob(encoded);
      let pos = decoded.indexOf(":");
      if (pos < 0) {
        this.error("Invalid Basic Auth header: " + auth);
        return false;
      }
      let username = decoded.substring(0, pos).trim();
      let password = decoded.substring(pos + 1).trim();

      let user = await this.getUserDiscovery().getUserFromEmail(username);

      if (!user) {
        this.error("Cannot find user with email " + username);
        return false;
      }

      // Check if the user has the API token
      return user.getApiTokens().get(apiName) === password;
    }
  },

  statics: {
    /**
     * Returns the request currently being processed.  This will throw an
     * exception if called outside of a request
     *
     * @returns {import("fastify").FastifyRequest}
     */
    getCurrentRequest() {
      let instance = zx.server.Standalone.getInstance();
      if (!(instance instanceof zx.server.WebServer)) {
        return null;
      }
      return instance.getRequestContext().request;
    },

    /**
     * Returns the reponse currently being processed.  This will throw an
     * exception if called outside of a request
     *
     * @returns {fastify.Response}
     */
    getCurrentResponse() {
      let instance = zx.server.Standalone.getInstance();
      if (!(instance instanceof zx.server.WebServer)) {
        return null;
      }
      return instance.getRequestContext().reply;
    },

    /**
     * Returns the session manager
     *
     * @returns {zx.server.SessionManager}
     */
    getSessionManager() {
      let instance = zx.server.Standalone.getInstance();
      if (!(instance instanceof zx.server.WebServer)) {
        return null;
      }
      return instance.getSessionManager();
    }
  }
});
