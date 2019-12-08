#!/usr/bin/env node

import updateNotifier from 'update-notifier'
import isCI from 'is-ci'
import chalk from 'chalk'
import yargs from 'yargs'
import create from './commands/create'
import publish from './commands/publish'
import pkg from '../package.json'
import checkVersion from '../check'

checkVersion()

const notifier = updateNotifier({
  pkg,
}) 
if (notifier.update && notifier.update.latest !== pkg.version && !isCI) {
  const old = notifier.update.current
  const { latest } = notifier.update
  let { type } = notifier.update
  switch (type) {
    case 'major':
      type = chalk.red(type)
      break
    case 'minor':
      type = chalk.yellow(type)
      break
    case 'patch':
      type = chalk.green(type)
      break
    default:
      break
  }

const changelog = `https://sklib.io/release-notes/`
  notifier.notify({
    message:
      `New ${type} version of ${pkg.name} available! ${chalk.red(
        old
      )} → ${chalk.green(latest)}\n` +
      `${chalk.yellow('Changelog:')} ${chalk.cyan(changelog)}\n` +
      `Run ${chalk.green(`npm install -g ${pkg.name}`)} to update!`,
  })
} 

yargs
  .scriptName('sklib')
  .command(create)
  .command(publish)
  .usage(
    `${pkg.version}

For help with a specific command, enter:
  sklib [command] help
`
  )
  .help()
  .alias('h', 'help')
  .demandCommand(1,'')
  .strict().argv