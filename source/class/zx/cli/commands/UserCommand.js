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

qx.Class.define("zx.cli.commands.UserCommand", {
  extend: qx.core.Object,

  members: {
    async createUser(username, fullName, password) {
      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();

      try {
        let clazz = zx.server.auth.User.getUserClass();
        let user = await server.findOneObjectByType(clazz, { username });
        if (user) {
          this.error(`A user called ${username} already exists`);
          await user.save();
          return;
        }
        user = new clazz().set({
          username: username,
          password: password
        });

        if (fullName) {
          user.setFullName(fullName);
        }
        await user.save();
      } finally {
        await server.stop();
      }
    },

    async setPassword(username, password) {
      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();

      try {
        let clazz = zx.server.auth.User.getUserClass();
        let user = await server.findOneObjectByType(clazz, { username });
        if (!user) {
          this.error(`Cannot find a user called ${username}`);
          return;
        }
        user.setPassword(password);
        await user.save();
      } finally {
        await server.stop();
      }
    },

    async createPermission(shortCode, description) {
      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();
      try {
        let security = await server.findOneObjectByType(zx.server.auth.Security, null, true);
        let perm = security.getPermissions().lookup(shortCode);
        if (!perm) {
          this.info(`Creating a permission with shortCode ${shortCode}`);
          perm = new zx.server.auth.Permission().set({
            shortCode: shortCode
          });

          if (description) {
            perm.setTitle(description);
          }
          await perm.save();
          security.getPermissions().push(perm);
          await security.save();
        } else {
          this.info(`Permission ${shortCode} already exists`);
          if (description) {
            perm.setTitle(description);
            await perm.save();
          }
        }
      } catch (ex) {
        console.log(ex);
      } finally {
        await server.stop();
      }
    },

    async addPermission(username, shortCode) {
      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();
      try {
        let clazz = zx.server.auth.User.getUserClass();
        let user = await server.findOneObjectByType(clazz, { username });
        if (!user) {
          this.error(`Cannot find a user called ${username}`);
          return;
        }

        let security = await server.findOneObjectByType(zx.server.auth.Security, null, true);
        let perm = security.getPermissions().lookup(shortCode);
        if (!perm) {
          this.error(`Cannot find a permission with shortCode ${shortCode}`);
          return;
        }
        if (!user.getPermissions().lookup(shortCode)) {
          user.getPermissions().push(perm);
          await user.save();
        }
      } catch (ex) {
        console.log(ex);
      } finally {
        await server.stop();
      }
    },

    async removePermission(username, shortCode) {
      let config = await zx.server.Config.getConfig();

      let server = new zx.server.Standalone();
      await server.start();
      try {
        let clazz = zx.server.auth.User.getUserClass();
        let user = await server.findOneObjectByType(clazz, { username });
        if (!user) {
          this.error(`Cannot find a user called ${username}`);
          return;
        }

        let security = await server.findOneObjectByType(zx.server.auth.Security, null, true);
        let perm = security.getPermissions().lookup(shortCode);
        if (!perm) {
          this.error(`Cannot find a permission with shortCode ${shortCode}`);
          return;
        }
        if (user.getPermissions().lookup(shortCode)) {
          user.getPermissions().remove(perm);
          await user.save();
        }
      } finally {
        await server.stop();
      }
    }
  },

  statics: {
    createCliCommand() {
      let cmd = new zx.cli.Command("user").set({
        description: "Utility commands for editing users"
      });

      let sub;

      /*
       * user create
       */
      sub = new zx.cli.Command("create").set({
        description: `Creates a user account`,
        async runFunc() {
          const { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.UserCommand();
          let password = flags.password;
          if (!password) {
            password = await zx.utils.Readline.question("Password: ", {
              hidden: true
            });
          }

          if (!password) {
            console.log("Cannot create a user without a password");
            process.exit(1);
          }
          return cmd.createUser(args["username"], args["full-name"] || null, password);
        }
      });

      sub.addArgument(
        new zx.cli.Argument("username").set({
          description: "the users login ID, usually an email address",
          required: true
        })
      );

      sub.addArgument(
        new zx.cli.Argument("full-name").set({
          description: "Optional full name"
        })
      );

      sub.addFlag(
        new zx.cli.Flag("password").set({
          shortCode: "p",
          description: "password to use (if not provided then the terminal is prompted)"
        })
      );

      cmd.addSubcommand(sub);

      /*
       * user create-permission
       */
      sub = new zx.cli.Command("create-permission").set({
        description: `Creates a permission`,
        async runFunc() {
          const { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.UserCommand();
          cmd.createPermission(args["short-code"], args["description"]);
        }
      });

      sub.addArgument(
        new zx.cli.Argument("short-code").set({
          description: "the permission short code to add",
          required: true
        })
      );

      sub.addArgument(
        new zx.cli.Argument("description").set({
          description: "Optional description"
        })
      );

      cmd.addSubcommand(sub);

      /*
       * user add-permission
       */
      sub = new zx.cli.Command("add-permission").set({
        description: `Adds a permission to a user account`,
        async runFunc() {
          const { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.UserCommand();
          cmd.addPermission(args["username"], args["permission"]);
        }
      });

      sub.addArgument(
        new zx.cli.Argument("username").set({
          description: "the users login ID, usually an email address",
          required: true
        })
      );

      sub.addArgument(
        new zx.cli.Argument("permission").set({
          description: "the permission short code to add",
          required: true
        })
      );

      cmd.addSubcommand(sub);

      /*
       * user remove-permission
       */
      sub = new zx.cli.Command("remove-permission").set({
        description: `Removes a permission from a user account`,
        async runFunc() {
          const { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.UserCommand();
          cmd.removePermission(args["username"], args["permission"]);
        }
      });

      sub.addArgument(
        new zx.cli.Argument("username").set({
          description: "the users login ID, usually an email address",
          required: true
        })
      );

      sub.addArgument(
        new zx.cli.Argument("permission").set({
          description: "the permission short code to add",
          required: true
        })
      );

      cmd.addSubcommand(sub);

      /*
       * user set-password
       */
      sub = new zx.cli.Command("set-password").set({
        description: `Sets a users password`,
        async runFunc() {
          const { args, flags } = this.getValues();
          let cmd = new zx.cli.commands.UserCommand();
          let password = flags.password;
          if (!password) {
            password = await zx.utils.Readline.question("Password: ", {
              hidden: true
            });
          }

          if (!password) {
            console.log("Cannot create a user without a password");
            process.exit(1);
          }
          return await cmd.setPassword(args["username"], password);
        }
      });

      sub.addArgument(
        new zx.cli.Argument("username").set({
          description: "the users login ID, usually an email address",
          required: true
        })
      );

      sub.addFlag(
        new zx.cli.Flag("password").set({
          shortCode: "p",
          description: "password to use (if not provided then the terminal is prompted)",
          type: "string"
        })
      );

      cmd.addSubcommand(sub);

      /*
       * Add API token
       */
      cmd.addSubcommand(new zx.server.auth.CreateApiTokenCommand());
      return cmd;
    }
  }
});
