import { AwsClient } from 'aws4fetch'

export type PutObjectOptions = {
  readonly cacheControl?: string
  readonly contentType: string
}

export type ObjectStore = {
  readonly exists: (key: string) => Promise<boolean>
  readonly getJson: (key: string) => Promise<unknown | undefined>
  readonly put: (
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options: PutObjectOptions,
  ) => Promise<void>
}

const encodeKey = (key: string): string =>
  key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

export class R2ObjectStore implements ObjectStore {
  readonly #bucketName: string
  readonly #client: AwsClient
  readonly #origin: string

  constructor(params: {
    readonly accessKeyId: string
    readonly accountId: string
    readonly bucketName: string
    readonly secretAccessKey: string
  }) {
    this.#bucketName = params.bucketName
    this.#origin = `https://${params.accountId}.r2.cloudflarestorage.com`
    this.#client = new AwsClient({
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      region: 'auto',
      service: 's3',
    })
  }

  #url(key: string): string {
    return `${this.#origin}/${this.#bucketName}/${encodeKey(key)}`
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.#client.fetch(this.#url(key), {
      method: 'HEAD',
    })
    if (response.status === 404) return false
    if (!response.ok) {
      throw new Error(`R2 HEAD ${key} failed with HTTP ${response.status}`)
    }
    return true
  }

  async getJson(key: string): Promise<unknown | undefined> {
    const response = await this.#client.fetch(this.#url(key))
    if (response.status === 404) return undefined
    if (!response.ok) {
      throw new Error(`R2 GET ${key} failed with HTTP ${response.status}`)
    }
    return response.json()
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options: PutObjectOptions,
  ): Promise<void> {
    const body =
      value instanceof Uint8Array ? Uint8Array.from(value).buffer : value
    const response = await this.#client.fetch(this.#url(key), {
      method: 'PUT',
      body,
      headers: {
        'Cache-Control':
          options.cacheControl || 'public, max-age=31536000, immutable',
        'Content-Type': options.contentType,
      },
    })
    if (!response.ok) {
      throw new Error(`R2 PUT ${key} failed with HTTP ${response.status}`)
    }
  }
}
