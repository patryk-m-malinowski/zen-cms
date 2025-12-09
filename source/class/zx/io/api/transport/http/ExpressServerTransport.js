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
 *    Patryk Malinowski (@patryk-m-malinowski)
 *    John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * ************************************************************************ */

/**
 * Implementation of server transport for Express.js
 */
qx.Class.define("zx.io.api.transport.http.ExpressServerTransport", {
  extend: zx.io.api.server.AbstractServerTransport,

  /**
   * Note: it is expected that the incoming app will use the `zx.io.api.transport.http.ExpressServerTransport.jsonMiddleware`
   * middleware. The result of this middleware is largely the same as `bodyParser.json()`, however it additionally
   * supports communicating certain classes, such as `Date`s, through JSON. See {@link zx.utils.Json} for details on
   * the additional classes supported.
   * @param {import("express").Express} app - the express instance to connect to.
   * @param {string} route - the route to listen on. Should not contain wildcards or pattern matches.
   */
  construct(app, route = "/zx-api/") {
    super();
    //remove trailing forward slash if there is one
    route = route.replace(/\/$/, "");
    this.__route = route;

    app.all(`${route}/**`, this.__serveRequest.bind(this));
  },

  members: {
    /**
     * @type {string}
     */
    __route: null,
    postMessage() {},

    /**@override */
    supportsServerPush() {
      return false;
    },

    /**
     *
     * @param {import("express").Request} req
     * @param {import("express").Respone} res
     * @returns
     */
    async __serveRequest(req, res) {
      let data = qx.lang.Object.clone(req.body, true) ?? {};
      if (this.getEncryptionMgr() && typeof data.body === "string") {
        let body = this.getEncryptionMgr().decryptData(data.body);
        try {
          body = zx.utils.Json.parseJson(body);
        } catch (e) {
          res.status(400);
          this.error(`Cannot decrypt JSON in request body. Path: ${req.path}, stack: ${e.stack}`);
          return res.send({ error: "Cannot decrypt JSON in request body" });
        }
        data.body = body;
      }
      const RE_ROUTE = new RegExp(`^${this.__route}`);
      let path = req.path.replace(RE_ROUTE, "");

      let request = new zx.io.api.server.Request(this, data).set({ path, restMethod: req.method, query: req.query });
      let response = new zx.io.api.server.Response(request);

      try {
        await zx.io.api.server.ConnectionManager.getInstance().receiveMessage(request, response);
      } catch (e) {
        this.error(`Error processing request for ${req.path}. Caused by: \n${e.stack}`);
        if (response.getStatusCode() === 200) {
          response.setStatusCode(500);
        }
        response.setErrorMessage(e.toString());
      }
      res.status(response.getStatusCode());
      //If we decide to encrypt responses, we would put it here
      //but right now it's not required
      res.send(response.toNativeObject());
    }
  },

  statics: {
    /**
     * Middleware for express services. This middleware provides a JSON object at `req.body`, supporting communicating
     * certain additional classes, such as `Date`s, over the network. See {@link zx.utils.Json} for details on the
     * additional classes supported.
     * @example
     * ```js
     * app.use(zx.io.api.transport.http.ExpressServerTransport.jsonMiddleware());
     * ```
     */
    jsonMiddleware() {
      return (req, res, next) => {
        let data = "";
        req.on("data", chunk => (data += chunk));
        req.on("end", () => {
          try {
            req.body = zx.utils.Json.parseJson(data);
          } catch (err) {
            return next(err);
          }
          next();
        });
      };
    }
  }
});
