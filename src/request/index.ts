import https from 'https'
import * as core from '@actions/core'

export async function uploadFile(
  formData: FormData,
  filepath: string,
  retries: number = 3
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(process.env['OASISBE_UPLOAD_URL'], {
        method: 'POST',
        body: formData,
        headers: JSON.parse(process.env['OASISBE_REQUEST_HEADER'])
      })

      if (!response.ok) {
        throw new Error(`Failed to upload ${filepath}: ${response.statusText}`)
      }

      const json = await response.json();

      core.debug(`Upload response: ${JSON.stringify(json)}`)

      return json;
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
