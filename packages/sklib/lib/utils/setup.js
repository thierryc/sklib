"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.install = install;
exports.initGit = initGit;
exports.isMissing = isMissing;

var _child_process = require("child_process");

var _ = require(".");

var _getGitUser = _interopRequireDefault(require("./get-git-user"));

async function install(cwd) {
  const child = (0, _child_process.spawn)('npm', ['install'], {
    cwd
  });
  child.stdin.setEncoding('utf-8');
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  let shouldAskForDevMode = false;
  let stderr = '';
  child.stdout.on('data', data => {
    if (data.indexOf('The Sketch developer mode is not enabled') !== -1) {
      // answer no for know but return true so that we can ask later
      shouldAskForDevMode = true;
      setTimeout(() => child.stdin.write('n\n'), 50);
    }
  });
  child.stderr.on('data', data => {
    stderr += data;
  });
  return new Promise((resolve, reject) => {
    child.on('close', () => resolve(shouldAskForDevMode));
    child.on('error', err => {
      console.error(stderr);
      reject(err);
    });
  });
} // Initializes the folder using `git init` and a proper `.gitignore` file
// if `git` is present in the $PATH.


async function initGit(target) {
  const git = (0, _.hasCommand)('git');

  if (git) {
    const cwd = target;
    await (0, _child_process.spawn)('git', ['init'], {
      cwd
    });
    await (0, _child_process.spawn)('git', ['add', '-A'], {
      cwd
    });
    const defaultGitUser = 'skpm-bot';
    const defaultGitEmail = 'bot@skpm.io';
    const gitUser = await (0, _getGitUser.default)(defaultGitEmail, defaultGitUser);
    await (0, _child_process.spawn)('git', ['commit', '-m', 'initial commit from skpm'], {
      cwd,
      env: {
        GIT_COMMITTER_NAME: gitUser.username,
        GIT_COMMITTER_EMAIL: gitUser.email,
        GIT_AUTHOR_NAME: defaultGitUser,
        GIT_AUTHOR_EMAIL: defaultGitEmail
      }
    });
  } else {
    (0, _.warn)('Could not locate `git` binary in `$PATH`. Skipping!');
  }
} // Formulate Questions if `create` args are missing


function isMissing(argv) {
  const out = [];

  const ask = (name, message, val) => {
    const type = val === undefined ? 'input' : 'confirm';
    out.push({
      name,
      message,
      type,
      default: val
    });
  }; // Required data


  !argv.dest && ask('dest', 'Directory to create the app'); // Extra data / flags

  !argv.name && ask('name', "The Library's name");
  !argv.force && ask('force', 'Enforce `dest` directory; will overwrite!', false);
  ask('install', 'Install dependencies', true); // defaults `true`, ask anyway

  !argv.git && ask('git', 'Initialize a `git` repository', false); // defaults `true`, ask anyway

  return out;
}