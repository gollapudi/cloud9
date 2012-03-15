"use strict";

var util = require("util");

var Plugin = require("../cloud9.core/plugin");
var c9util = require("../cloud9.core/util");

var name = "git";
var ProcessManager;
var EventBus;

module.exports = function setup(options, imports, register) {
    ProcessManager = imports["process-manager"];
    EventBus = imports.eventbus;
    imports.ide.register(name, GitPlugin, register);
};

var GitPlugin = function(ide, workspace) {
    Plugin.call(this, ide, workspace);

    this.pm = ProcessManager;
    this.eventbus = EventBus;
    this.workspaceId = workspace.workspaceId;
    this.channel = this.workspaceId + "::git";

    this.hooks = ["command"];
    this.name = "git";

    this.gitEnv = {
        GIT_ASKPASS: "/bin/echo",
        EDITOR: "",
        GIT_EDITOR: ""
    };
};

util.inherits(GitPlugin, Plugin);

(function() {

    this.init = function() {
        var self = this;
        this.eventbus.on(this.channel, function(msg) {
            self.ide.broadcast(JSON.stringify(msg), self.name);
        });
    };

    this.command = function (user, message, client) {
        var self = this;
        var cmd = message.command ? message.command.toLowerCase() : "";

        if (cmd !== "git")
            return false;

        if (message.argv.indexOf("config") != -1) {
            return this.sendResult(0, message.command, {
                code: 1,
                argv: message.argv,
                err: null,
                out: "Sorry, you're now allowed to change the Git config on our servers"
            });
        }

        if (typeof message.protocol == "undefined")
            message.protocol = "client";

        this.pm.spawn("shell", {
            command: "git",
            args: message.argv.slice(1),
            cwd: message.cwd,
            env: this.gitEnv,
        }, this.channel, function(err, pid) {
            if (err)
                self.error(err, 1, message, client);
        });

        return true;
    };

    var githelp     = null;
    var commandsMap = {
            "default": {
                "commands": {
                    "[PATH]": {"hint": "path pointing to a folder or file. Autocomplete with [TAB]"}
                }
            }
        };

    this.$commandHints = function(commands, message, callback) {
        var self = this;

        if (!githelp) {
            githelp = {};
            this.pm.exec("shell", {
                command: "git",
                args: [],
                cwd: message.cwd,
                env: this.gitEnv
            }, function(code, out, err) {
                if (!out && err)
                    out = err;

                if (!out)
                    return callback();

                githelp = {"git": {
                    "hint": "the stupid content tracker",
                    "commands": {}
                }};
                out.replace(/[\s]{3,4}([\w]+)[\s]+(.*)\n/gi, function(m, sub, hint) {
                    githelp.git.commands[sub] = self.augmentCommand(sub, {"hint": hint});
                });
                onfinish();
            }, null, null);
        }
        else {
            onfinish();
        }

        function onfinish() {
            c9util.extend(commands, githelp);
            callback();
        }
    };

    this.augmentCommand = function(cmd, struct) {
        var map = commandsMap[cmd] || commandsMap["default"];
        return c9util.extend(struct, map || {});
    };

    this.dispose = function(callback) {
        // TODO kill all running processes!
        callback();
    };

}).call(GitPlugin.prototype);