"use strict";

const extractRepository = require('./extract-repository');

module.exports = function getSklibConfig(packageJSON, argv) {
  const sklibConfig = packageJSON.sklib || {};
  argv = argv || {}; // eslint-disable-line

  return {
    main: argv.output || sklibConfig.main || packageJSON.main,
    version: sklibConfig.version || packageJSON.version,
    homepage: sklibConfig.homepage || packageJSON.homepage,
    description: sklibConfig.description || packageJSON.description,
    name: sklibConfig.name || packageJSON.name,
    title: sklibConfig.title || packageJSON.title,
    identifer: sklibConfig.identifier || packageJSON.name,
    appcast: sklibConfig.appcast || packageJSON.appcast,
    resources: sklibConfig.resources || packageJSON.resources || [],
    assets: sklibConfig.assets || packageJSON.assets || [],
    babel: sklibConfig.babel || packageJSON.babel,
    repository: extractRepository(sklibConfig.repository || packageJSON.repository),
    author: sklibConfig.author || packageJSON.author,
    test: sklibConfig.test || {}
  };
};