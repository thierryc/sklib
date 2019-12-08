"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _ora = _interopRequireDefault(require("ora"));

var _path = _interopRequireDefault(require("path"));

var _fs = _interopRequireDefault(require("fs"));

var _xml2js = _interopRequireDefault(require("xml2js"));

var _open = _interopRequireDefault(require("open"));

var _inquirer = require("inquirer");

var _exec = require("../utils/exec");

var _sklibConfig = _interopRequireDefault(require("../utils/sklib-config"));

var _extractRepository = _interopRequireDefault(require("../utils/extract-repository"));

var _replaceArraysByLastItem = _interopRequireDefault(require("../utils/replace-arrays-by-last-item"));

var _auth = _interopRequireDefault(require("../utils/auth"));

var _github = _interopRequireDefault(require("../utils/github"));

var _asyncCommand = _interopRequireDefault(require("../utils/async-command"));

var _utils = require("../utils");

const EMPTY_APPCAST = {
  rss: {
    $: {
      'xmlns:sparkle': 'http://www.andymatuschak.org/xml-namespaces/sparkle',
      'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      version: '2.0'
    },
    channel: [{
      item: []
    }]
  }
};
let CACHED_TOKEN;

async function getToken(repo) {
  if (CACHED_TOKEN) {
    return CACHED_TOKEN;
  }

  try {
    const token = await _auth.default.getToken();
    await _github.default.getRepo(token, repo);
    CACHED_TOKEN = token;
    return token;
  } catch (e) {
    (0, _utils.error)(`The repository doesn't exist or the GitHub token is invalid`);
    throw e;
  }
}

var _default = (0, _asyncCommand.default)({
  command: 'publish <bump>',
  desc: 'Publish a new version of the library. <bump> can be the new version number or any of the following: major, minor, patch, premajor preminor, prepatch, prerelease.',
  builder: {
    'repo-url': {
      description: 'Specify the repository URL (default to the one specified in package.json).',
      type: 'string'
    },
    'skip-release': {
      description: 'Do not create a release on GitHub.com.',
      type: 'boolean',
      // conflicts: 'open-release', // TODO un-comment when https://github.com/yargs/yargs/issues/929 is fixed
      implies: 'download-url'
    },
    'open-release': {
      description: 'Open the newly created release on GitHub.com.',
      type: 'boolean',
      alias: 'o'
    },
    'skip-registry': {
      description: 'Do not publish to the libraries registry if not already present.',
      type: 'boolean'
    },
    'download-url': {
      description: "Specify the new version's download URL (default to the asset of the release created on GitHub.com).",
      type: 'string'
    },
    appcast: {
      description: 'Specify the local path to the appcast (default to .appcast.xml). If `false`, then the appcast update will be skipped',
      type: 'string'
    }
  },

  async handler(argv) {
    (0, _replaceArraysByLastItem.default)(argv, ['repoUrl', 'skipRelease', 'openRelease', 'skipRegistry', 'downloadUrl', 'appcast']);
    let packageJSON;

    try {
      packageJSON = require(_path.default.join(process.cwd(), 'package.json'));
    } catch (err) {
      (0, _utils.error)(`Error while reading the package.json file`);
      throw err;
    }

    const sklibConfig = (0, _sklibConfig.default)(packageJSON);
    const repo = argv.repoUrl && (0, _extractRepository.default)(argv.repoUrl) || sklibConfig.repository;

    if (!repo) {
      throw new Error('Please supply github.com repo URL as --repo-url or in "repository" field in the package.json.');
    }

    let token;

    if (!argv.skipRelease || !argv.skipRegistry) {
      token = await getToken(repo);
    }

    let tag = sklibConfig.version;
    let spinner = null;

    function print(text, action) {
      if (process.env.CI) {
        console.log(text);
      } else if (spinner) {
        if (action) {
          spinner[action](text);
        } else {
          spinner.text = text;

          if (!spinner.isSpinning) {
            spinner.start();
          }
        }
      } else {
        spinner = new _ora.default({
          text,
          color: 'magenta'
        }).start();
      }
    }

    print(`Checking if \`${repo}\` is accessible`);

    if (argv.bump) {
      print('Bumping package.json version and creating git tag');
      const {
        stdout
      } = await (0, _exec.exec)(`npm version ${argv.bump} -m "Publish %s release :rocket:" --allow-same-version`);
      tag = stdout.trim();
    }

    if (argv.appcast !== 'false') {
      print('Updating the appcast file');

      const appcast = _path.default.join(process.cwd(), (argv.appcast || sklibConfig.appcast || '.appcast.xml').replace(/^\.\//g, ''));

      const appcastObj = await new Promise(resolve => {
        _fs.default.readFile(appcast, (err, data) => {
          if (err) {
            return resolve(EMPTY_APPCAST);
          }

          return _xml2js.default.parseString(data, (parseErr, result) => {
            if (parseErr) {
              return resolve(EMPTY_APPCAST);
            }

            return resolve(result);
          });
        });
      });
      appcastObj.rss.channel[0].item.unshift({
        enclosure: [{
          $: {
            url: argv.downloadUrl || `https://github.com/${repo}/releases/download/${tag}/${_path.default.basename(sklibConfig.main)}`,
            'sparkle:version': tag.replace('v', '')
          }
        }]
      });
      const builder = new _xml2js.default.Builder();
      const xml = await builder.buildObject(appcastObj);

      _fs.default.writeFileSync(appcast, xml);

      await (0, _exec.exec)(`git add "${appcast}"`);
      await (0, _exec.exec)('git commit -m "Update .appcast with new tag :sparkles:"');
    }

    print('Pushing the changes to Github');
    await (0, _exec.exec)(`git push origin HEAD`);

    if (argv.bump) {
      await (0, _exec.exec)(`git push -f origin HEAD ${tag}`);
    }

    if (!argv.skipRelease) {
      let script = (packageJSON.scripts || {}).prepublish && 'prepublish';

      if (!script) {
        script = (packageJSON.scripts || {}).prepare && 'prepare';
      }

      if (!script) {
        script = (packageJSON.scripts || {}).build && 'build';
      }

      if (script) {
        print('Building the library');
        await (0, _exec.exec)(`NODE_ENV=production npm run ${script}`);
      }

      print('Creating a draft release on GitHub');
      const {
        id: releaseId
      } = await _github.default.createDraftRelease(token, repo, tag);
      print('Uploading asset');
      await _github.default.updateAsset(token, repo, releaseId, `${_path.default.basename(sklibConfig.main)}`, `${_path.default.basename(sklibConfig.main)}`);
      print('Publishing the release');
      await _github.default.publishRelease(token, repo, releaseId);
    }

    if (!argv.skipRegistry && (!packageJSON.sklib || !packageJSON.sklib.private)) {
      print('Checking if the library is on the official library directory');
      const upstreamPluginJSON = await _github.default.getRegistryRepo(token, sklibConfig, repo);

      if (!upstreamPluginJSON.existingPlugin) {
        if (spinner) spinner.stop();
        const {
          addToRegistry
        } = await (0, _inquirer.prompt)({
          type: 'confirm',
          name: 'addToRegistry',
          message: `The library is not on the libraries registry yet. Do you wish to add it?`,
          default: true
        });

        if (addToRegistry) {
          print('Publishing the library on the official library directory');
          await _github.default.addPluginToPluginsRegistryRepo(token, sklibConfig, repo, upstreamPluginJSON);
        }
      }
    }

    print('Plugin published!', 'succeed');
    console.log(`${sklibConfig.name}@${tag.replace('v', '')}`);

    if (argv.openRelease) {
      (0, _open.default)(`https://github.com/${repo}/tag/${tag.replace('v', '')}`);
    }
  }

});

exports.default = _default;