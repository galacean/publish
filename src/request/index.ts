import https from 'https'
import * as core from '@actions/core'

export async function uploadFile(
  formData: FormData,
  filepath: string,
  retries: number = 3
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // fetch 在 body 为 FormData 时会自动生成带 boundary 的 Content-Type。
      // 若 OASISBE_REQUEST_HEADER 里带了无 boundary 的 Content-Type（如 multipart/form-data），
      // 在 Node 24（新 undici）下会覆盖掉自动生成的 boundary，导致后端 multipart 解析不到文件。
      // 因此这里主动剥掉 Content-Type，交由 fetch 自动设置。
      const headers = JSON.parse(process.env['OASISBE_REQUEST_HEADER'] || '{}')
      delete headers['Content-Type']
      delete headers['content-type']

      const response = await fetch(process.env['OASISBE_UPLOAD_URL'], {
        method: 'POST',
        body: formData,
        headers,
      })

      if (!response.ok) {
        throw new Error(`Failed to upload ${filepath}: ${response.statusText}`)
      }

      const json = await response.json()

      core.debug(`Upload response: ${JSON.stringify(json)}`)

      return json
    } catch (error) {
      core.debug(
        `Attempt ${attempt} failed: ${error.message}, retrying... ${attempt}`
      )
      if (attempt === retries) {
        core.error(`Attempt ${attempt} failed: ${error.message}`)
        core.debug(error)
        core.setFailed(error)
        throw new Error('Max retry attempts reached')
      }
    }
  }
  throw new Error(`Unexpected error occurred while uploading: ${filepath}`)
}
