"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _crossSpawnPromise = _interopRequireDefault(require("cross-spawn-promise"));

async function _default(defaultEmail, defaultUsername) {
  const [email, username] = await Promise.all([(0, _crossSpawnPromise.default)('git', ['config', 'user.email']).catch(() => defaultEmail), (0, _crossSpawnPromise.default)('git', ['config', 'user.name']).catch(() => defaultUsername)]);
  return {
    email: email && email.toString(),
    username: username && username.toString()
  };
}