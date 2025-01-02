import path from 'path'
import { fileFromPath } from 'formdata-node/file-from-path'
import { uploadByPublicKey } from './request'
import crypto from 'crypto'
import { AxiosResponse } from 'axios'
import fs from 'fs'
import * as core from '@actions/core'

const publicKey = process.env['OASISBE_PUBLIC_KEY']

function wait(time: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, time)
  })
}

async function recursiveDist(
  distPath: string,
  callback: (filepath: string) => Promise<any>
) {
  const files = fs.readdirSync(distPath)
  for (let i = 0; i < files.length; i++) {
    const filename = files[i]
    const filepath = path.join(distPath, filename)
    const stat = fs.statSync(filepath)
    if (stat.isFile()) {
      await callback(filepath)
      await wait(80)
    } else if (stat.isDirectory()) {
      await recursiveDist(filepath, callback)
    }
  }
}

export async function uploadPackageJS(dirPath: string) {
  const nightly = core.getInput('nightly')

  core.debug(`Is nightly release: ${nightly}`)

  const distPath = path.join(dirPath, 'dist')
  if (!fs.existsSync(distPath)) {
    core.info(`${distPath} does not exist, ignore release.`)
    return
  }
  const pkg = JSON.parse(
    fs.readFileSync(path.join(dirPath, 'package.json'), {
      encoding: 'utf-8'
    })
  )
  const version = pkg.version
  const tagOrVersion = nightly === 'true' ? 'nightly' : version
  core.debug(`upload package: ${pkg.name}`)
  await recursiveDist(distPath, async filepath => {
    core.debug(`start upload: ${filepath}`)
    try {
      const res = await retry(
        () =>
          upload({
            filename: path.basename(filepath),
            filepath,
            alias: `${pkg.name}/${tagOrVersion}/${path.relative(distPath, filepath)}`
          }),
        5,
        1000
      ) // 5 retries with 1 second delay
      core.info(`uploaded: ${res.data}`)
    } catch (error) {
      core.error(`Failed to upload ${filepath}: ${error.message}`)
    }
  })
}

async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  delay: number
): Promise<T> {
  let attempts = 0
  while (attempts < maxRetries) {
    try {
      return await fn()
    } catch (error) {
      attempts++
      if (attempts >= maxRetries) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('Max retries exceeded')
}

export async function upload({
  filename,
  alias,
  filepath
}: {
  filename: string
  alias: string
  filepath: string
}) {
  const form = new FormData()
  const message = 'upload'
  const signature = crypto.publicEncrypt(publicKey, Buffer.from(message))
  const file = await fileFromPath(filepath, 'index.txt')
  form.append('signature', signature.toString('base64'))
  form.append('filename', 'index.txt')
  form.append('alias', alias)
  form.append('file', file)

  const result = (await uploadByPublicKey(form, filepath)) as AxiosResponse<{
    data: string
  }>
  return result.data
}
