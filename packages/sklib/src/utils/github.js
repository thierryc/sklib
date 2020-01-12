import path from 'path'
import fs from 'fs'
import parseAuthor from 'parse-author'
import { request, streamingRequest } from './request'

function options(token, url, method) {
  return {
    method: method || 'GET',
    url,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Token ${token}`,
      'User-Agent': 'SKLIB-Release-Agent',
    },
  }
}

function getRegistryRepo(token, sklibConfig, repo) {
  const [, name] = repo.split('/')
  return request(
    options(
      token,
      'https://api.github.com/repos/thierryc/sketch-libraries-directory/contents/libraries.json'
    )
  )
    .then(data => {
      const file = JSON.parse(data)
      const buf = Buffer.from(file.content, 'base64')
      return {
        libraries: JSON.parse(buf.toString('utf-8')),
        file,
      }
    })
    .then(res => ({
      existingLibrary: res.libraries.find(
        library => library.title === sklibConfig.name || name === library.name
      ),
      libraries: res.libraries,
      file: res.file,
    }))
}

export default {
  getUser(token) {
    const result = request(options(token, 'https://api.github.com/user'))
    // console.log(result);
    return result;
  },
  getRepo(token, repo) {
    if (!token) {
      return Promise.reject(
        new Error('You are not logged in. Please run `sklib login` first.')
      )
    }
    return request(options(token, `https://api.github.com/repos/${repo}`)).then(
      res => {
        const permissions = JSON.parse(res).permissions || {}
        if (!permissions.push) {
          throw new Error(
            `You don't have the right permissions on the repo. Need the "push" permission and only got:\n' ${JSON.stringify(
              permissions,
              null,
              '  '
            )}`
          )
        }
      }
    )
  },
  createDraftRelease(token, repo, tag) {
    const opts = options(
      token,
      `https://api.github.com/repos/${repo}/releases`,
      'POST'
    )
    opts.json = {
      tag_name: tag,
      name: tag,
      draft: true,
    }
    return request(opts)
  },
  updateAsset(token, repo, releaseId, assetName, fileName) {
    const opts = options(
      token,
      `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(
        fileName
      )}&label=${encodeURIComponent(
        'To install: ' // TODO help message
      )}`,
      'POST'
    )
    const asset = path.join(process.cwd(), assetName)
    const stat = fs.statSync(asset)
    const rd = fs.createReadStream(asset)
    opts.headers['Content-Type'] = 'application/octet-stream'
    opts.headers['Content-Length'] = stat.size

    return streamingRequest(rd, opts)
  },
  publishRelease(token, repo, releaseId) {
    const opts = options(
      token,
      `https://api.github.com/repos/${repo}/releases/${releaseId}`,
      'PATCH'
    )
    opts.json = {
      draft: false,
    }
    return request(opts)
  },

  getRegistryRepo,

  // get the upstream libraries.json
  // if we haven't added the library yet
  // get or create a fork
  // delete any existing branch for this library
  // check if origin master is up to date with upstream (update otherwise)
  // branch
  // update origin libraries.json
  // open PR
  addLibraryToLibrariesRegistryRepo(token, sklibConfig, repo, upstreamLibraryJSON) {
    const [owner, name] = repo.split('/')

    function deleteExistingBranch(fork) {
      const opts = options(
        token,
        `https://api.github.com/repos/${fork.full_name}/git/refs/heads/${repo}`,
        'DELETE'
      )
      return request(opts).catch(() => {})
    }

    function getOriginBranchSHA(fork) {
      return deleteExistingBranch(fork).then(() =>
        Promise.all([
          request(
            options(
              token,
              `https://api.github.com/repos/${
                fork.full_name
              }/git/refs/heads/master`
            )
          ),
          request(
            options(
              token,
              `https://api.github.com/repos/thierryc/sketch-libraries-directory/git/refs/heads/master`
            )
          ),
        ])
          .then(([originData, upstreamData]) => ({
            originSHA: JSON.parse(originData).object.sha,
            upstreamSHA: JSON.parse(upstreamData).object.sha,
          }))
          .then(({ originSHA, upstreamSHA }) => {
            if (originSHA === upstreamSHA) {
              return originSHA
            }
            // merge upstream master so that there is no conflicts
            const opts = options(
              token,
              `https://api.github.com/repos/${
                fork.full_name
              }/git/refs/heads/master`,
              'PATCH'
            )
            opts.json = {
              sha: upstreamSHA,
            }
            return request(opts).then(() => upstreamSHA)
          })
          .then(headSHA => {
            const opts = options(
              token,
              `https://api.github.com/repos/${fork.full_name}/git/refs`,
              'POST'
            )
            opts.json = {
              ref: `refs/heads/${repo}`,
              sha: headSHA,
            }
            return request(opts)
          })
          .then(() =>
            // now we just need to get the SHA of the file in the branch
            request(
              options(
                token,
                `https://api.github.com/repos/${
                  fork.full_name
                }/contents/libraries.json?ref=${repo}`
              )
            ).then(data => JSON.parse(data).sha)
          )
      )
    }

    function forkUpstream(res) {
      return request(
        options(
          token,
          'https://api.github.com/repos/thierryc/sketch-libraries-directory/forks',
          'POST'
        )
      )
        .then(fork => JSON.parse(fork))
        .then(fork =>
          getOriginBranchSHA(fork).then(sha => ({
            libraryUpdate: res,
            fork,
            sha,
          }))
        )
    }

    function updateLibraryJSON({ libraryUpdate, fork, sha }) {
      const opts = options(
        token,
        `https://api.github.com/repos/${fork.full_name}/contents/libraries.json`,
        'PUT'
      )

      const library = {
        title: sklibConfig.title || sklibConfig.name,
        description: sklibConfig.description,
        name,
        owner,
        appcast: `https://raw.githubusercontent.com/${repo}/master/.appcast.xml`,
        homepage: sklibConfig.homepage || `https://github.com/${repo}`,
      }

      if (sklibConfig.author) {
        let { author } = sklibConfig
        if (typeof sklibConfig.author === 'string') {
          author = parseAuthor(sklibConfig.author)
        }
        library.author = author.name
      }

      const newLibraries = JSON.stringify(
        libraryUpdate.libraries.concat(library),
        null,
        2
      )
      let buf
      if (typeof Buffer.from === 'function') {
        // Node 5.10+
        buf = Buffer.from(newLibraries, 'utf-8')
      } else {
        // older Node versions
        buf = new Buffer(newLibraries, 'utf-8') // eslint-disable-line
      }
      opts.json = {
        path: 'libraries.json',
        message: `Add the ${repo} library`,
        committer: {
          name: 'sklib-bot',
          email: 'bot@sklib.io',
        },
        sha,
        content: buf.toString('base64'),
        branch: repo,
      }

      return request(opts).then(res => ({
        res,
        fork,
        sha,
      }))
    }

    function openPR({ fork }) {
      const prOptions = options(
        token,
        'https://api.github.com/repos/thierryc/sketch-libraries-directory/pulls',
        'POST'
      )
      prOptions.json = {
        title: `Add the ${repo} library`,
        head: `${fork.owner.login}:${repo}`,
        body: `Hello Team :wave:

The library is [here](${sklibConfig.homepage ||
          `https://github.com/${repo}`}) if you want to have a look.

Hope you are having a great day :)
`,
        base: 'master',
        maintainer_can_modify: true,
      }
      return request(prOptions)
    }

    return forkUpstream(upstreamLibraryJSON)
      .then(updateLibraryJSON)
      .then(openPR)
  },
}
