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

qx.Class.define("zx.test.cli.TestCommand", {
  extend: qx.core.Object,

  construct(url) {
    super();
    this.__url = url;
  },

  members: {
    __url: null,

    async run() {
      /*
      await zx.test.TestRunner.runAll(zx.test.util.TestRequire);
      await zx.test.TestRunner.runAll(zx.test.jsx.TestJsx);
      await zx.test.TestRunner.runAll(zx.test.io.persistence.TestPersistence);
      await zx.test.TestRunner.runAll(zx.test.io.persistence.TestImportExport);
      await zx.test.TestRunner.runAll(zx.test.io.persistence.TestNedbDatabase);
      await zx.test.TestRunner.runAll(zx.test.io.remote.TestPropertyChanges);
       await zx.test.TestRunner.runAll(zx.test.cms.TestTemplates);
      */

      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();

      await zx.test.TestRunner.runAll(zx.test.cms.TestRendering);

      return 0;
    }
  },

  statics: {
    createCliCommand() {
      return new zx.cli.Command("test").set({
        description: "Runs some unit tests (this is only expected to work in the zx.cms directory)",
        runFunc: async () => {
          return await new zx.test.cli.TestCommand().run();
        }
      });
    }
  }
});
