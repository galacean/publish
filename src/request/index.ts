import axios from 'axios'
import https from 'https'
import * as core from '@actions/core'

// At request level
const agent = new https.Agent({
  rejectUnauthorized: false
})

export function uploadByPublicKey(form: FormData, filepath: string) {
  return axios.post(process.env['OASISBE_UPLOAD_URL'], form, {
    httpsAgent: agent,
    headers: JSON.parse(process.env['OASISBE_REQUEST_HEADER'])
  })
  .then(res => {
    return res.status === 200 ? res : Promise.reject(res)
  }).catch(err => {
    core.debug(`Upload failed. filename is ${form.get('filename')}, alias is ${form.get('alias')}, filepath is ${filepath}`)
    core.debug(err);
    core.error(err)
    core.setFailed(err)
  });
}
