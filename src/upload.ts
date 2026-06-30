import path from 'path'
import { uploadFile } from './request'
import crypto from 'crypto'
import { AxiosResponse, get } from 'axios'
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

function getAllFiles(dirPath: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isFile()) {
      files.push(fullPath)
    } else if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath))
    }
  }

  return files
}

export async function uploadPackageJS(dirPath: string) {
  const specific_tag = core.getInput('specific_tag')

  core.debug(`Is nightly release: ${specific_tag === 'nightly'}`)

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
  const tagOrVersion = specific_tag ? specific_tag : version
  core.debug(`upload package: ${pkg.name}, version: ${tagOrVersion}`)

  const files = getAllFiles(distPath)

  for (const file of files) {
    // 跳过 sourcemap 文件，不上传到 CDN
    if (path.extname(file) === '.map') {
      core.debug(`skip sourcemap: ${file}`)
      continue
    }
    core.debug(`start upload: ${file}`)
    try {
      const response = await upload({
        filename: path.basename(file),
        filepath: file,
        alias: `${pkg.name}/${tagOrVersion}/${path.relative(distPath, file)}`
      })
      core.info(`uploaded: ${response}`)
    } catch (error) {
      core.error(`Failed to upload ${file}: ${error.message}`)
    }
  }
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
  // 使用原生 Blob 而非 formdata-node 的 fileFromPath：
  // Node 24(新 undici) 的 FormData.append 会把非原生 Blob(如 formdata-node 的 File)
  // 当作普通值 stringify 成 "[object File]"，导致后端收不到文件 part，报 "Can't found upload file"。
  // 原生 Blob 在 Node 20/22/24 下都能被正确识别为文件。
  const file = new Blob([fs.readFileSync(filepath)])
  form.append('signature', signature.toString('base64'))
  form.append('filename', filename)
  form.append('alias', alias)
  form.append('file', file, 'index.txt')

  const result = await uploadFile(form, filepath)
  return result.data
}
