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

qx.Class.define("zx.cli.Command", {
  extend: qx.core.Object,

  construct(name, description) {
    super();
    this.setName(name);
    if (description) {
      this.setDescription(description);
    }
    this.__subcommands = [];
    this.__flags = [];
    this.__arguments = [];
    this.addFlag(
      new zx.cli.Flag("help").set({
        description: "Outputs usage summary",
        type: "boolean"
      })
    );
  },

  properties: {
    /** The name that is this part of the command */
    name: {
      check: "String",
      transform: "__transformName"
    },

    /** Short equivalent of the name */
    shortCode: {
      init: null,
      nullable: true,
      check: "String"
    },

    /** Optional description */
    description: {
      init: null,
      nullable: true,
      check: "String"
    },

    /** Function to run this command, called with the result of `getValues()` and the command itself
     */
    runFunc: {
      init: null,
      nullable: true,
      check: "Function"
    }
  },

  members: {
    /** @type{zx.cli.Command[]} subcommands */
    __subcommands: null,

    /** @type{zx.cli.Command} parent comamnd */
    __parent: null,

    /** @type{zx.cli.Flag[]} list of flag definitions */
    __flags: null,

    /** @type{zx.cli.Argument} list of positional arguments */
    __arguments: null,

    /** @type{String[]?} list of error messages */
    __errors: null,

    /**
     * Adds a sub command
     *
     * @param {zx.cli.Command} cmd
     */
    addSubcommand(cmd) {
      let current = this.__subcommands.find(tmp => tmp.getName() == cmd.getName());
      if (current) {
        qx.lang.Array.remove(this.__subcommands, current);
      }
      this.__subcommands.push(cmd);
      cmd.__parent = this;
    },

    /**
     * Returns the parent command if this is a sub command
     *
     * @returns {zx.cli.Command?}
     */
    getParent() {
      return this.__parent;
    },

    /**
     * Adds a flag
     *
     * @param {zx.cli.Flag} flag
     */
    addFlag(flag) {
      if (qx.core.Environment.get("qx.debug")) {
        this.assertTrue(flag instanceof zx.cli.Flag, "flag must be an instance of zx.cli.Flag");
      }
      this.__flags.push(flag);
    },

    /**
     * Locates a flag by name
     *
     * @param {String} name
     * @return {zx.cli.Flag}
     */
    getFlag(name) {
      name = qx.lang.String.camelCase(name);
      for (let i = 0; i < this.__flags.length; i++) {
        if (this.__flags[i].getName() == name) {
          return this.__flags[i];
        }
      }
      return null;
    },

    /**
     * Adds a positional argument
     *
     * @param {zx.cli.Argument} argument
     */
    addArgument(argument) {
      if (qx.core.Environment.get("qx.debug")) {
        this.assertTrue(argument instanceof zx.cli.Argument, "argument must be an instance of zx.cli.Argument");
      }
      this.__arguments.push(argument);
    },

    /**
     * Locates an argument by name or index
     *
     * @param {String|Integer} name
     * @return {zx.cli.Argument}
     */
    getArgument(name) {
      if (typeof name == "string") {
        name = qx.lang.String.camelCase(name);
        for (let i = 0; i < this.__arguments.length; i++) {
          if (this.__arguments[i].getName() == name) {
            return this.__arguments[i];
          }
        }
        return null;
      }
      return this.__arguments[name] || null;
    },

    /**
     * Transform for `name`
     */
    __transformName(value) {
      return qx.lang.String.camelCase(value);
    },

    /**
     * Returns the hyphenated version of the `name` property (which is always held as camelCase)
     *
     * @returns {String}
     */
    getHyphenatedName() {
      return qx.lang.String.hyphenate(this.getName());
    },

    /**
     * Prints usage information
     */
    usage() {
      let out = [""];
      function print(...args) {
        out[out.length - 1] += args.join(" ");
      }
      function println(...args) {
        print(...args);
        out.push("");
      }
      let columnify = require("columnify");
      function table(data) {
        let str = columnify(data, { showHeaders: false });
        str = str
          .split("\n")
          .map(row => "   " + row)
          .join("\n");
        println(str);
      }

      let verbs = [];
      for (let tmp = this; tmp; tmp = tmp.getParent()) {
        verbs.unshift(tmp.getHyphenatedName());
      }

      const sortByName = arr => {
        return qx.lang.Array.clone(arr).sort((l, r) => {
          l = l.getName();
          r = r.getName();
          return l < r ? -1 : l > r ? 1 : 0;
        });
      };

      println("USAGE:");
      print(`   ${verbs.join(" ")}`);
      if (this.__flags.length > 0) {
        print(` [FLAGS]`);
      }
      if (this.__subcommands.length > 0) {
        print(` [COMMAND]`);
      }
      if (this.__arguments.length > 0) {
        print(` [ARGUMENTS]`);
      }
      println();
      if (this.__flags.length > 0) {
        println();
        println("FLAGS:");
        let data = [];
        sortByName(this.__flags).forEach(flag => data.push(flag.usage().split(/\s+::\s+/)));
        table(data);
      }
      if (this.__subcommands.length > 0) {
        println();
        println("COMMANDS:");
        let data = [];
        sortByName(this.__subcommands).forEach(cmd => data.push(cmd._quickUsage().split(/\s+::\s+/)));
        table(data);
      }
      if (this.__arguments.length > 0) {
        println();
        println("ARGUMENTS:");
        let data = [];
        sortByName(this.__arguments).forEach(argument => data.push(argument.usage().split(/\s+::\s+/)));
        table(data);
      }
      return out.join("\n");
    },

    /**
     * Quick one line usage description
     *
     * @returns {String}
     */
    _quickUsage() {
      let str = this.getName();
      str = qx.lang.String.hyphenate(str);
      if (this.__subcommands.length) {
        str += " (...)";
      }
      if (this.getDescription()) {
        str += "  ::  " + this.getDescription();
      }
      return str;
    },

    /**
     * Returns the values parsed for flags and arguments as a handy POJO; the
     *
     * @typedef ValuesDef
     * @property {Map<String,Object>} flags
     * @property {Map<String,Object>} arguments
     *
     * @return {ValuesDef}
     */
    getValues() {
      let result = {
        flags: {},
        args: []
      };

      this.__flags.forEach(flag => {
        result.flags[flag.getName()] = result.flags[flag.getHyphenatedName()] = flag.getValue();
      });
      this.__arguments.forEach(argument => {
        if (argument.getName()) {
          result.args[argument.getName()] = result.args[argument.getHyphenatedName()] = argument.getValue();
        }
        result.args.push(argument.getValue());
      });
      return result;
    },

    /**
     * Adds an error message
     *
     * @param {String} msg
     */
    _error(msg) {
      if (!this.__errors) {
        this.__errors = [];
      }
      this.__errors.push(msg);
    },

    /**
     * Returns error messages
     *
     * @returns {String[]}
     */
    getErrors() {
      return this.__errors;
    },

    /**
     * Tests whether the string matches this command
     *
     * @param {String} arg
     * @returns {Boolean}
     */
    is(arg) {
      return arg == this.getName() || arg == this.getShortCode();
    },

    /**
     * Parses the command, where this is the root of the command structure
     *
     * @param {String[]?} argv arguments, where argv[0] is the command name (typically the filename, what would be `$0` in bash)
     */
    parseRoot(argv) {
      if (!argv) {
        argv = qx.lang.Array.clone(process.argv);
        qx.lang.Array.removeAt(argv, 0);
      }

      let exe = argv[0];
      let pos = exe.lastIndexOf("/");
      if (pos > -1) {
        exe = exe.substring(pos + 1);
      }
      this.setName(exe);

      let argvIterator = new zx.cli.ArgvIterator(argv);
      let cmd = this.parse(argv[0], argvIterator);
      if (argvIterator.peek() !== null) {
        this._error(`More arguments than expected, starting from ${argvIterator.peek()}`);
      }
      return cmd;
    },

    /**
     * Parses the command
     *
     * @param {String} cmdName the name
     * @param {zx.cli.ArgvIterator} argvIterator the command line arguments
     * @returns {zx.cli.Command} the command to execute after parsing
     */
    parse(cmdName, argvIterator) {
      const parseArgument = (argument, value) => {
        try {
          argument.parse(value, argvIterator);
        } catch (ex) {
          this._error(ex.message);
        }
      };

      const parseFlag = (flag, value) => {
        try {
          flag.parse(value, argvIterator);
        } catch (ex) {
          this._error(ex.message);
        }
      };

      const findSubcommand = arg => {
        arg = qx.lang.String.camelCase(arg);
        for (let arr = this.__subcommands, i = 0; i < arr.length; i++) {
          let cmd = arr[i];
          if (cmd.is(arg)) {
            return cmd;
          }
        }
        return null;
      };

      const findFlag = arg => {
        for (let i = 0; i < this.__flags.length; i++) {
          let flag = this.__flags[i];
          if (flag.is(arg)) {
            return flag;
          }
        }
        return null;
      };

      let done = false;
      let finalCommand = this;
      let currentArgumentIndex = 0;
      let scanningForArguments = false;
      let flagsAlreadyParsed = [];
      while (!done) {
        let value = argvIterator.peek();
        if (!value) {
          break;
        }

        // Once we hit "--", then it's positional arguments only thereafter
        if (value == "--") {
          argvIterator.pop();
          while ((value = argvIterator.pop())) {
            if (currentArgumentIndex < this.__arguments.length) {
              let argument = this.__arguments[currentArgumentIndex++];
              parseArgument(argument, value);
            }
          }
          break;
        }

        // Is it a flag?
        if (value[0] == "-") {
          let flag = findFlag(value);
          if (!flag) {
            throw Error(`Unrecognised flag ${value} passed to ${this.getHyphenatedName()}`);
          }
          if (flagsAlreadyParsed.indexOf(flag) > -1) {
            if (!flag.isArray()) {
              this.warn("Flag " + flag + " specified more than once");
            }
          } else {
            flagsAlreadyParsed.push(flag);
          }
          argvIterator.pop();
          parseFlag(flag, value);
        } else {
          if (!scanningForArguments) {
            // Sub command processing
            let subcommand = findSubcommand(value);
            if (subcommand) {
              argvIterator.pop();
              finalCommand = subcommand.parse(value, argvIterator);
            }

            // After a sub command, any argv that the subcommand has not consumed now
            //  belongs to our positional arguments
            scanningForArguments = true;
            if (subcommand) {
              continue;
            }
          }

          // Positional arguments
          if (currentArgumentIndex < this.__arguments.length) {
            argvIterator.skip();
            let argument = this.__arguments[currentArgumentIndex++];
            parseArgument(argument, value);
          } else {
            break;
          }
        }
      }

      this._validate();

      let helpRequested = finalCommand.getFlag("help").getValue();
      if (!helpRequested) {
        // Check for missing mandatory arguments
        while (currentArgumentIndex < this.__arguments.length) {
          let argument = this.__arguments[currentArgumentIndex++];
          if (argument.isRequired()) {
            this._error(`Not enough positional arguments for ${this.getHyphenatedName()}`);
            break;
          }
        }

        // Check for missing mandatory flags
        Object.values(this.__flags).forEach(flag => {
          if (flag.isRequired() && flag.getValue() === null) {
            this._error(`Missing value for ${flag}`);
          }
        });
      }

      // Return the command (or sub command) to execute
      return finalCommand;
    },

    /**
     * Called to provide extra validation by the command; call `-error()` to add an error message
     */
    _validate() {
      // Nothing
    },

    /**
     * Parses the command line and performs the required tasks.  The process will terminate if
     * there is an error or the command returns a number (ie exit code)
     *
     * @returns {Integer} the exit code
     */
    async execute() {
      let cmd = null;
      try {
        cmd = this.parseRoot();
      } catch (ex) {
        console.error("Error: " + ex.message);
        process.exit(-1);
      }
      let errors = (cmd && cmd.getErrors()) || null;
      if (errors) {
        console.error((cmd || this).usage());
        console.error(errors.join("\n"));
        process.exit(-1);
      }

      if (!cmd || errors || cmd.getFlag("help").getValue()) {
        console.log((cmd || this).usage());
        process.exit(0);
      }

      let exitCode = await cmd.run();
      if (typeof exitCode == "number") {
        process.exit(exitCode);
      }
    },

    /**
     * Runs the command
     * @returns
     */
    async run() {
      let fn = this.getRunFunc();
      if (fn != null) {
        return await fn.call(this, this.getValues(), this);
      }
      return await this._runImpl();
    },

    /**
     * Implementation of run, provided that the `run` property is null
     */
    async _runImpl() {
      console.log(this.usage());
    },

    toString() {
      return this.getName();
    }
  }
});
