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
 * @ignore(fetch)
 */

qx.Class.define("zx.io.api.transport.http.HttpClientTransport", {
  extend: zx.io.api.client.AbstractClientTransport,

  properties: {
    polling: {
      refine: true,
      init: true
    }
  },

  members: {
    /**
     * @override
     */
    async postMessage(path, requestJson) {
      let url = zx.utils.Uri.join(this.getServerUri() ?? "", path ?? "");

      if (this.getForwardTo()) {
        requestJson.headers["Forward-To"] = this.getForwardTo();
      }

      if (this.getEncryptionMgr()) {
        let body = zx.utils.Json.stringifyJson(requestJson.body);
        requestJson.body = this.getEncryptionMgr().encryptData(body);
      }
      let output = zx.utils.Json.stringifyJson(requestJson);
      let httpResponse = await fetch(url, {
        method: "POST",
        body: output,
        headers: { "Content-Type": "text/plain" }
      }).catch(e => {
        throw new Error("Error fetching " + url + ": " + e.message);
      });
      let responseText = await httpResponse.text();

      let data = zx.utils.Json.parseJson(responseText);
      if (data.error) {
        throw new Error(data.error);
      }
      //If we decide to encrypt responses, we would put the decryption here
      //but right now it's not required
      this.fireDataEvent("message", data);
    },
    /**
     * @override
     * @param {zx.io.api.server.Request} request
     * @param {zx.io.api.server.Response} response
     */
    async sendRequest(request, response) {
      let url = zx.utils.Uri.join(this.getServerUri() ?? "", request.getPath());

      let httpResponse = await fetch(url, {
        method: "POST",
        body: zx.utils.Json.stringifyJson(request.toNativeObject()),
        headers: { "Content-Type": "text/plain" }
      }).catch(e => {
        response.setStatusCode(502);
        throw new Error("Error fetching " + url + ": " + e.message);
      });

      let responseText = await httpResponse.text();
      let data = zx.utils.Json.parseJson(responseText);
      if (data?.error) {
        response.setStatusCode(httpResponse.status);
        throw new Error("gateway error: " + data.error);
      }
      response.setData(data.data);
    }
  }
});
