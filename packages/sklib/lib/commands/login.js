"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _ora = _interopRequireDefault(require("ora"));

var _inquirer = require("inquirer");

var _asyncCommand = _interopRequireDefault(require("../utils/async-command"));

var _auth = _interopRequireDefault(require("../utils/auth"));

var _github = _interopRequireDefault(require("../utils/github"));

var _default = (0, _asyncCommand.default)({
  command: 'login [token]',
  desc: 'Enter your GitHub access token and save it in the keychain.\n This token will be used to publish new releases on the repo.\nThe token needs the `repo` permissions in order to create releases. It will not be used for anything else.\n\nYou can create a new token here: https://github.com/settings/tokens/new',

  async handler(argv) {
    if (!argv.token) {
      const response = await (0, _inquirer.prompt)([{
        name: 'token',
        message: 'GitHub Token',
        type: 'input'
      }]);
      Object.assign(argv, response);
    }

    const spinner = (0, _ora.default)({
      text: 'Checking if the token is valid',
      color: 'magenta'
    }).start();

    try {
      await _github.default.getUser(argv.token);
    } catch (err) {
      spinner.fail(`Token invalid`);
      throw err.err || err.body || err;
    }

    spinner.text = 'Saving the token in the keychain';
    await _auth.default.saveToken(argv.token);
    spinner.succeed('Done!');
  }

});

exports.default = _default;