import Ora from 'ora'
import path from 'path'
import fs from 'fs'
import xml2js from 'xml2js'
import open from 'open'
import { prompt } from 'inquirer'
import { exec } from '../utils/exec'

import getSklibConfig from '../utils/sklib-config'
import extractRepository from '../utils/extract-repository'
import replaceArraysByLastItem from '../utils/replace-arrays-by-last-item'

import auth from '../utils/auth'
import github from '../utils/github'
import asyncCommand from '../utils/async-command'
import { error } from '../utils'

const EMPTY_APPCAST = {
  rss: {
    $: {
      'xmlns:sparkle': 'http://www.andymatuschak.org/xml-namespaces/sparkle',
      'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
      version: '2.0',
    },
    channel: [{ item: [] }],
  },
}

let CACHED_TOKEN
async function getToken(repo) {
  if (CACHED_TOKEN) {
    return CACHED_TOKEN
  }
  try {
    const token = await auth.getToken()
    await github.getRepo(token, repo)
    CACHED_TOKEN = token
    return token
  } catch (e) {
    error(`The repository doesn't exist or the GitHub token is invalid`)
    throw e
  }
}

export default asyncCommand({
  command: 'publish <bump>',

  desc:
    'Publish a new version of the library. <bump> can be the new version number or any of the following: major, minor, patch, premajor preminor, prepatch, prerelease.',

  builder: {
    'repo-url': {
      description:
        'Specify the repository URL (default to the one specified in package.json).',
      type: 'string',
    },
    'skip-release': {
      description: 'Do not create a release on GitHub.com.',
      type: 'boolean',
      // conflicts: 'open-release', // TODO un-comment when https://github.com/yargs/yargs/issues/929 is fixed
      implies: 'download-url',
    },
    'open-release': {
      description: 'Open the newly created release on GitHub.com.',
      type: 'boolean',
      alias: 'o',
    },
    'skip-registry': {
      description:
        'Do not publish to the libraries registry if not already present.',
      type: 'boolean',
    },
    'download-url': {
      description:
        "Specify the new version's download URL (default to the asset of the release created on GitHub.com).",
      type: 'string',
    },
    appcast: {
      description:
        'Specify the local path to the appcast (default to .appcast.xml). If `false`, then the appcast update will be skipped',
      type: 'string',
    },
  },

  async handler(argv) {
    replaceArraysByLastItem(argv, [
      'repoUrl',
      'skipRelease',
      'openRelease',
      'skipRegistry',
      'downloadUrl',
      'appcast',
    ])

    let packageJSON
    try {
      packageJSON = require(path.join(process.cwd(), 'package.json'))
    } catch (err) {
      error(`Error while reading the package.json file`)
      throw err
    }

    const sklibConfig = getSklibConfig(packageJSON)

    const repo =
      (argv.repoUrl && extractRepository(argv.repoUrl)) || sklibConfig.repository

    if (!repo) {
      throw new Error(
        'Please supply github.com repo URL as --repo-url or in "repository" field in the package.json.'
      )
    }

    let token
    if (!argv.skipRelease || !argv.skipRegistry) {
      token = await getToken(repo)
    }

    let tag = sklibConfig.version

    let spinner = null

    function print(text, action) {
      if (process.env.CI) {
        console.log(text)
      } else if (spinner) {
        if (action) {
          spinner[action](text)
        } else {
          spinner.text = text
          if (!spinner.isSpinning) {
            spinner.start()
          }
        }
      } else {
        spinner = new Ora({
          text,
          color: 'magenta',
        }).start()
      }
    }

    print(`Checking if \`${repo}\` is accessible`)

    if (argv.bump) {
      print('Bumping package.json version and creating git tag')
      const { stdout } = await exec(
        `npm version ${
          argv.bump
        } -m "Publish %s release :rocket:" --allow-same-version`
      )
      tag = stdout.trim()
    }

    if (argv.appcast !== 'false') {
      print('Updating the appcast file')

      const appcast = path.join(
        process.cwd(),
        (argv.appcast || sklibConfig.appcast || '.appcast.xml').replace(
          /^\.\//g,
          ''
        )
      )
      const appcastObj = await new Promise(resolve => {
        fs.readFile(appcast, (err, data) => {
          if (err) {
            return resolve(EMPTY_APPCAST)
          }
          return xml2js.parseString(data, (parseErr, result) => {
            if (parseErr) {
              return resolve(EMPTY_APPCAST)
            }
            return resolve(result)
          })
        })
      })

      appcastObj.rss.channel[0].item.unshift({
        enclosure: [
          {
            $: {
              url:
                argv.downloadUrl ||
                `https://github.com/${repo}/releases/download/${tag}/${path
                  .basename(sklibConfig.main)}`,
              'sparkle:version': tag.replace('v', ''),
            },
          },
        ],
      })
      const builder = new xml2js.Builder()
      const xml = await builder.buildObject(appcastObj)

      fs.writeFileSync(appcast, xml)

      await exec(`git add "${appcast}"`)
      await exec('git commit -m "Update .appcast with new tag :sparkles:"')
    }

    print('Pushing the changes to Github')

    await exec(`git push origin HEAD`)

    if (argv.bump) {
      await exec(`git push -f origin HEAD ${tag}`)
    }

    if (!argv.skipRelease) {
      let script = (packageJSON.scripts || {}).prepublish && 'prepublish'
      if (!script) {
        script = (packageJSON.scripts || {}).prepare && 'prepare'
      }
      if (!script) {
        script = (packageJSON.scripts || {}).build && 'build'
      }

      if (script) {
        print('Building the library')
        await exec(`NODE_ENV=production npm run ${script}`)
      }

      print('Creating a draft release on GitHub')
      const { id: releaseId } = await github.createDraftRelease(
        token,
        repo,
        tag
      )

      print('Uploading asset')
      await github.updateAsset(
        token,
        repo,
        releaseId,
        `${path.basename(sklibConfig.main)}`,
        `${path.basename(sklibConfig.main)}`
      )

      print('Publishing the release')
      await github.publishRelease(token, repo, releaseId)

      
    }

    if (
      !argv.skipRegistry &&
      (!packageJSON.sklib || !packageJSON.sklib.private)
    ) {
      print('Checking if the library is on the official library directory')
      const upstreamLibraryJSON = await github.getRegistryRepo(
        token,
        sklibConfig,
        repo
      )
      if (!upstreamLibraryJSON.existingLibrary) {
        if (spinner) spinner.stop()
        const { addToRegistry } = await prompt({
          type: 'confirm',
          name: 'addToRegistry',
          message: `The library is not on the libraries registry yet. Do you wish to add it?`,
          default: true,
        })
        if (addToRegistry) {
          print('Publishing the library on the official library directory')
          await github.addLibraryToLibraryRegistryRepo(
            token,
            sklibConfig,
            repo,
            upstreamLibraryJSON
          )
        }
      }
    }

    print('Library published!', 'succeed')
    console.log(`${sklibConfig.name}@${tag.replace('v', '')}`)

    if (argv.openRelease) {
      open(`https://github.com/${repo}/tag/${tag.replace('v', '')}`)
    }
  },
})