import * as core from '@actions/core'
import { exec } from './exec'
import path from 'path'
import fs from 'fs/promises'
import { uploadPackageJS } from './upload'
import { glob, globSync, globStream, globStreamSync, Glob } from 'glob'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const needPublish = core.getInput('publish')

    core.debug(`need publish: ${needPublish}`)

    if (needPublish === 'true') {
      const tag = await getPublishTag()
      core.info(`publish tag is ${tag}`)
      const stdout = await exec(`pnpm publish -r --tag ${tag} --no-git-checks`)
      core.info(stdout)
    }

    const packages = core.getMultilineInput('packages')

    const cwd = process.cwd()

    if (packages && packages.length) {
      core.debug(`dirs: ${JSON.stringify(packages)}`)
      await Promise.all(
        packages.map(dir => uploadPackageJS(path.join(cwd, dir)))
      )
    } else {
      const dirs = await fs.readdir(path.join(cwd, 'packages'))
      core.debug(`dirs: ${JSON.stringify(dirs)}`)
      await Promise.all(
        dirs.map(dir => uploadPackageJS(path.join(cwd, 'packages', dir)))
      )
    }
  } catch (error) {
    core.error(JSON.stringify(error))
    core.setFailed(error)
  }
}

async function getPublishTag() {
  try {
    const pkg = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'package.json'), {
        encoding: 'utf-8'
      })
    )
    const version = pkg.version
    core.debug(`current version: ${version}`)
    if (!version) {
      return 'latest'
    }
    const match = version.match(/-(.*?)(\.|\-)/)
    if (match) {
      return match[1]
    } else {
      return 'latest'
    }
  } catch (e) {
    core.setFailed(e)
  }
}
