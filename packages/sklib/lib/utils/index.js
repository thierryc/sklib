"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isDir = isDir;
exports.hasCommand = hasCommand;
exports.info = info;
exports.warn = warn;
exports.error = error;

var _chalk = _interopRequireDefault(require("chalk"));

var _fs = require("fs");

var _logSymbols = _interopRequireDefault(require("log-symbols"));

var _which = _interopRequireDefault(require("which"));

function isDir(str) {
  return (0, _fs.existsSync)(str) && (0, _fs.statSync)(str).isDirectory();
}

function hasCommand(str) {
  return !!_which.default.sync(str, {
    nothrow: true
  });
}

function info(text, code) {
  process.stderr.write(`${_logSymbols.default.info}${_chalk.default.blue(' INFO ')}${text}\n`);
  code && process.exit(code);
}

function warn(text, code) {
  process.stdout.write(`${_logSymbols.default.warning}${_chalk.default.yellow(' WARN ')}${text}\n`);
  code && process.exit(code);
}

function error(text, code) {
  process.stderr.write(`\n${_logSymbols.default.error}${_chalk.default.red(' ERROR ')}${text}\n`);
  code && process.exit(code);
}