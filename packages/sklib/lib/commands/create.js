"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _ora = _interopRequireDefault(require("ora"));

var _globby = _interopRequireDefault(require("globby"));

var _gittar = _interopRequireDefault(require("gittar"));

var _fs = _interopRequireDefault(require("fs.promised"));

var _chalk = require("chalk");

var _path = require("path");

var _inquirer = require("inquirer");

var _jszip = _interopRequireDefault(require("jszip"));

var _checkDevMode = _interopRequireDefault(require("../utils/check-dev-mode"));

var _replaceArraysByLastItem = _interopRequireDefault(require("../utils/replace-arrays-by-last-item"));

var _asyncCommand = _interopRequireDefault(require("../utils/async-command"));

var _getGitUser = _interopRequireDefault(require("../utils/get-git-user"));

var _utils = require("../utils");

var _setup = require("../utils/setup");

const TEMPLATE = 'thierryc/sklib-default-template';
const RGX = /\.(woff2?|ttf|eot|jpe?g|ico|png|gif|mp4|mov|ogg|webm)(\?.*)?$/i;

const isMedia = str => RGX.test(str);

function buildStubs(argv) {
  const stubs = new Map();
  ['name', 'slug'].forEach(str => {
    // if value is defined
    if (argv[str] !== undefined) {
      stubs.set(new RegExp(`{{\\s?${str}\\s}}`, 'g'), argv[str]);
    }
  });
  return stubs;
}

function replaceStubs(stubs, string) {
  let result = string;
  stubs.forEach((v, k) => {
    result = result.replace(k, v);
  });
  return result;
}

var _default = (0, _asyncCommand.default)({
  command: 'create <dest>',
  desc: 'Create a new Sketch library project.',
  builder: {
    cwd: {
      description: 'A directory to use instead of $PWD.',
      type: 'string',
      default: '.'
    },
    name: {
      description: "The plugin's name",
      type: 'string'
    },
    template: {
      description: 'The repository hosting the template to start from',
      type: 'string',
      default: 'thierryc/sklib-default-template'
    },
    force: {
      description: 'Force option to create the directory for the new app',
      type: 'boolean',
      default: false
    },
    git: {
      description: 'Initialize version control using git',
      type: 'boolean',
      default: true
    },
    install: {
      description: 'Install dependencies',
      type: 'boolean',
      default: true
    }
  },

  async handler(argv) {
    (0, _replaceArraysByLastItem.default)(argv, ['cwd', 'name', 'template', 'force', 'git', 'install']); // Prompt if incomplete data

    if (!argv.dest) {
      (0, _utils.warn)('Insufficient command arguments! Prompting...');
      (0, _utils.info)('Alternatively, run `sklib create --help` for usage info.');
      const questions = (0, _setup.isMissing)(argv);
      const response = await (0, _inquirer.prompt)(questions);
      Object.assign(argv, response);
    }

    if (!argv.name) {
      argv.name = argv.dest; // eslint-disable-line
    }

    if (!argv.name) {
      return (0, _utils.error)('Need to specify a destination', 1);
    }

    argv.slug = argv.name.toLowerCase().replace(/\s+/g, '-'); // eslint-disable-line

    const cwd = (0, _path.resolve)(argv.cwd);
    const target = argv.dest && (0, _path.resolve)(cwd, argv.dest);
    const exists = target && (0, _utils.isDir)(target);

    if (exists && !argv.force) {
      return (0, _utils.error)('Refusing to overwrite current directory! Please specify a different destination or use the `--force` flag', 1);
    }

    if (exists && argv.force) {
      const {
        enableForce
      } = await (0, _inquirer.prompt)({
        type: 'confirm',
        name: 'enableForce',
        message: `You are using '--force'. Do you wish to continue?`,
        default: false
      });

      if (enableForce) {
        (0, _utils.info)('Initializing project in the current directory!');
      } else {
        return (0, _utils.error)('Refusing to overwrite current directory!', 1);
      }
    }

    const repo = argv.template || TEMPLATE;
    const spinner = (0, _ora.default)({
      text: 'Fetching the template',
      color: 'magenta'
    }).start();

    function print(text) {
      if (process.env.CI) {
        console.log(text);
      } else {
        spinner.text = text;
      }
    }

    print('Fetching the template'); // Attempt to fetch the `template`

    const archive = await _gittar.default.fetch(repo).catch(err => {
      spinner.fail('An error occured while fetching template.');
      return (0, _utils.error)((err || {}).code === 404 ? `Could not find repository: ${repo}` : (err || {}).message, 1);
    });
    print('Extracting the template'); // Extract files from `archive` to `target`

    const keeps = [];
    await _gittar.default.extract(archive, target, {
      strip: 2,

      filter(path, obj) {
        if (path.includes('/template/')) {
          obj.on('end', () => {
            if (obj.type === 'File' && !isMedia(obj.path)) {
              keeps.push(obj.absolute);
            }
          });
          return true;
        }

        return false;
      }

    });

    if (!keeps.length) {
      return (0, _utils.error)(`No \`template\` directory found within ${repo}!`, 1);
    }

    const stubs = buildStubs(argv); // Update each file's contents

    const enc = 'utf8'; // eslint-disable-next-line no-restricted-syntax

    for (const entry of keeps) {
      if ((0, _path.extname)(entry) === '.sketch') {
        const data = await _fs.default.readFile(entry);
        const zip = await _jszip.default.loadAsync(data);
        const promises = []; // replace in all the pages

        zip.folder('pages').forEach(relativePath => {
          promises.push(async () => {
            const pagePath = `pages/${relativePath}`;
            let buf = await zip.file(pagePath).async('string');
            buf = replaceStubs(stubs, buf);
            zip.file(pagePath, buf);
          });
        });
        await Promise.all(promises.map(x => x()));
        await new Promise((resolvePromise, reject) => {
          zip.generateNodeStream({
            type: 'nodebuffer',
            streamFiles: true
          }).pipe(_fs.default.createWriteStream(entry)).on('finish', () => {
            // JSZip generates a readable stream with a "end" event,
            // but is piped here in a writable stream which emits a "finish" event.
            resolvePromise();
          }).on('error', reject);
        });
      } else {
        let buf = await _fs.default.readFile(entry, enc);
        buf = replaceStubs(stubs, buf);
        await _fs.default.writeFile(entry, buf, enc);
      }
    }

    print('Parsing `package.json` file'); // Validate user's `package.json` file

    let pkgData;
    const pkgFile = (0, _path.resolve)(target, 'package.json');

    if (pkgFile) {
      pkgData = JSON.parse((await _fs.default.readFile(pkgFile)));
    } else {
      (0, _utils.warn)('Could not locate `package.json` file!');
    }

    if (pkgData && !pkgData.author) {
      const gitUser = await (0, _getGitUser.default)();

      if (gitUser && gitUser.username && gitUser.email) {
        pkgData.author = `${gitUser.username.trim()} <${gitUser.email.trim()}>`;
      }
    } // Update `package.json` key


    if (pkgData) {
      print('Updating `name` within `package.json` file');
      pkgData.name = argv.slug;

      if (!pkgData.sklib) {
        pkgData.sklib = {};
      }

      pkgData.sklib.name = argv.name;

      if (!pkgData.sklib.main || pkgData.sklib.main === 'library.sketch') {
        pkgData.sklib.main = `${argv.slug}.sketch`;
      }
    } // Find a `manifest.json`; use the first match, if any


    const files = await (0, _globby.default)(`${target}/**/manifest.json`);
    const manifest = files[0] && JSON.parse((await _fs.default.readFile(files[0])));

    if (manifest && manifest.menu) {
      print('Updating `title` within `manifest.json` file');
      manifest.menu.title = argv.name; // Write changes to `manifest.json`

      await _fs.default.writeFile(files[0], JSON.stringify(manifest, null, 2));
    }

    if (pkgData) {
      // Assume changes were made ¯\_(ツ)_/¯
      await _fs.default.writeFile(pkgFile, JSON.stringify(pkgData, null, 2));
    }

    let shouldAskForDevMode = false;

    if (argv.install) {
      print('Installing dependencies');
      shouldAskForDevMode = await (0, _setup.install)(target, spinner);
    }

    spinner.succeed('Done!\n');

    if (!process.env.CI && shouldAskForDevMode) {
      await (0, _checkDevMode.default)();
    }

    if (argv.git) {
      await (0, _setup.initGit)(target);
    }

    return `${`
To get started, cd into the new directory:
  ${(0, _chalk.green)(`cd ${argv.dest}`)}

To start a development live-reload build for sketch library gh-page:
  ${(0, _chalk.green)(`npm run start`)}

To build the gh-page:
  ${(0, _chalk.green)(`npm run build`)}

To publish the library:
  ${(0, _chalk.green)('sklib publish')}
`}\n`;
  }

});

exports.default = _default;