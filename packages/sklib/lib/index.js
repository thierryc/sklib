#!/usr/bin/env node
"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

var _updateNotifier = _interopRequireDefault(require("update-notifier"));

var _isCi = _interopRequireDefault(require("is-ci"));

var _chalk = _interopRequireDefault(require("chalk"));

var _yargs = _interopRequireDefault(require("yargs"));

var _create = _interopRequireDefault(require("./commands/create"));

var _publish = _interopRequireDefault(require("./commands/publish"));

var _package = _interopRequireDefault(require("../package.json"));

var _check = _interopRequireDefault(require("../check"));

(0, _check.default)();
const notifier = (0, _updateNotifier.default)({
  pkg: _package.default
});

if (notifier.update && notifier.update.latest !== _package.default.version && !_isCi.default) {
  const old = notifier.update.current;
  const {
    latest
  } = notifier.update;
  let {
    type
  } = notifier.update;

  switch (type) {
    case 'major':
      type = _chalk.default.red(type);
      break;

    case 'minor':
      type = _chalk.default.yellow(type);
      break;

    case 'patch':
      type = _chalk.default.green(type);
      break;

    default:
      break;
  }

  const changelog = `https://sklib.io/release-notes/`;
  notifier.notify({
    message: `New ${type} version of ${_package.default.name} available! ${_chalk.default.red(old)} → ${_chalk.default.green(latest)}\n` + `${_chalk.default.yellow('Changelog:')} ${_chalk.default.cyan(changelog)}\n` + `Run ${_chalk.default.green(`npm install -g ${_package.default.name}`)} to update!`
  });
}

_yargs.default.scriptName('sklib').command(_create.default).command(_publish.default).usage(`${_package.default.version}

For help with a specific command, enter:
  sklib [command] help
`).help().alias('h', 'help').demandCommand(1, '').strict().argv;