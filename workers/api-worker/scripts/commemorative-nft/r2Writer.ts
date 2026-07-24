import { AwsClient } from 'aws4fetch'
import type { ArtifactWriter } from './pipeline'

const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

export const createR2ArtifactWriter = (params: {
  readonly accessKeyId: string
  readonly accountId: string
  readonly bucketName: string
  readonly secretAccessKey: string
}): ArtifactWriter => {
  const client = new AwsClient({
    accessKeyId: params.accessKeyId,
    secretAccessKey: params.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
  const origin = `https://${params.accountId}.r2.cloudflarestorage.com`

  return {
    write: async (key, value) => {
      const response = await client.fetch(
        `${origin}/${params.bucketName}/${encodeKey(key)}`,
        {
          method: 'PUT',
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': key.endsWith('.json')
              ? 'application/json; charset=utf-8'
              : 'text/plain; charset=utf-8',
          },
          body: value,
        },
      )
      if (!response.ok) {
        throw new Error(
          `R2 upload failed for ${key} with HTTP ${response.status}`,
        )
      }
    },
  }
}
