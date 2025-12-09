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
 * Model class representing a response to a request to the server,
 * They are created by the transport class when a message is received from the client
 */
qx.Class.define("zx.io.api.server.Response", {
  extend: qx.core.Object,
  /**
   *
   * @param {zx.io.api.server.Request?} request
   * @param {zx.io.api.IResponseJson} data Set this is if you are creating a response from a JSON object
   */
  construct(request = null, data) {
    super();
    if (data) {
      this.__data = data;
    } else {
      this.__data = [];
    }
    this.setRequest(request);
  },
  properties: {
    /**
     * @readonly
     * The request that this response is for.
     * Null if this response is not for a request (e.g. a server push)
     */
    request: {
      check: "zx.io.api.server.Request",
      init: null,
      nullable: true
    },

    /**
     * Follows HTTP conventions, so 200 is OK, 404 is Not Found, etc.
     */
    statusCode: {
      check: "Number",
      init: 200
    },

    /**
     * General error.
     * E.g. proxy exception, etc.
     */
    errorMessage: {
      init: null,
      nullable: true,
      check: "String"
    }
  },
  members: {
    /**
     * The data items of this response
     * @type {zx.io.api.IResponseJson.IResponseData[]}
     */
    __data: null,

    /**
     *
     * @returns {zx.io.api.IResponseJson.IResponseData[]}
     */
    getData() {
      return this.__data;
    },

    /**
     * Overwrites the internal data of this response.
     * Use with caution!
     * @param {zx.io.api.IResponseJson.IResponseData[]} data
     */
    setData(data) {
      this.__data = data;
    },

    /**
     *
     * @param {zx.io.api.IResponseJson.IResponseData} data
     */
    addData(data) {
      this.__data.push(data);
    },

    /**
     * @returns {zx.io.api.IResponseJson | Object} A native object representing the data of this response
     
     */
    toNativeObject() {
      //If the request is from REST (i.e. not from a client API),
      // we will only have one data item, so we return that directly
      // If the request is from a client API, we return an object with a data property
      // containing the data items
      // This is because the client API can have multiple data items
      // (e.g. publications), while REST requests can only have one data item
      if (this.getRequest() && !this.getRequest().isFromClientApi()) {
        return this.__data[0];
      } else {
        return {
          data: this.__data,
          error: this.getErrorMessage()
        };
      }
    }
  }
});
