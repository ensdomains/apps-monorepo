import type { MediaCapture } from './capture.js'
import { normalizeTokenId, renderInputKey, tokenAssetKey } from './keys.js'
import type { ObjectStore } from './r2.js'
import { parseRenderInput } from './renderInput.js'

export type PrepareResult =
  | { readonly status: 'already-generated' }
  | { readonly status: 'in-progress' }
  | { readonly status: 'started' }

const assetUrl = (
  publicAssetOrigin: string,
  tokenId: string,
  extension: 'mp4' | 'png',
): string => `${publicAssetOrigin}/${tokenId}.${extension}`

export class TokenGenerationService {
  readonly #capture: MediaCapture
  readonly #externalOrigin?: string
  readonly #jobs = new Map<string, Promise<void>>()
  #queue = Promise.resolve()
  readonly #publicAssetOrigin: string
  readonly #publicR2Origin: string
  readonly #store: ObjectStore

  constructor(params: {
    readonly capture: MediaCapture
    readonly externalOrigin?: string
    readonly publicAssetOrigin: string
    readonly publicR2Origin: string
    readonly store: ObjectStore
  }) {
    this.#capture = params.capture
    this.#externalOrigin = params.externalOrigin
    this.#publicAssetOrigin = params.publicAssetOrigin
    this.#publicR2Origin = params.publicR2Origin
    this.#store = params.store
  }

  async #isComplete(tokenId: string): Promise<boolean> {
    const results = await Promise.all([
      this.#store.exists(tokenAssetKey(tokenId, 'json')),
      this.#store.exists(tokenAssetKey(tokenId, 'png')),
      this.#store.exists(tokenAssetKey(tokenId, 'mp4')),
    ])
    return results.every(Boolean)
  }

  async #generate(tokenId: string): Promise<void> {
    const inputKey = renderInputKey(tokenId)
    const input = parseRenderInput(await this.#store.getJson(inputKey))
    const renderInputUrl = `${this.#publicR2Origin}/${inputKey}`
    const media = await this.#capture.capture({
      tokenId,
      renderInput: input,
      renderInputUrl,
    })

    await Promise.all([
      this.#store.put(tokenAssetKey(tokenId, 'png'), media.png, {
        contentType: 'image/png',
      }),
      this.#store.put(tokenAssetKey(tokenId, 'mp4'), media.mp4, {
        contentType: 'video/mp4',
      }),
    ])

    const metadata = {
      ...input,
      image: assetUrl(this.#publicAssetOrigin, tokenId, 'png'),
      animation_url: assetUrl(this.#publicAssetOrigin, tokenId, 'mp4'),
      ...(this.#externalOrigin
        ? { external_url: `${this.#externalOrigin}/${tokenId}` }
        : {}),
    }
    await this.#store.put(
      tokenAssetKey(tokenId, 'json'),
      JSON.stringify(metadata),
      { contentType: 'application/json; charset=utf-8' },
    )
  }

  async prepare(rawTokenId: string): Promise<PrepareResult> {
    const tokenId = normalizeTokenId(rawTokenId)
    if (await this.#isComplete(tokenId)) {
      return { status: 'already-generated' }
    }
    if (this.#jobs.has(tokenId)) return { status: 'in-progress' }

    const job = this.#queue
      .then(() => this.#generate(tokenId))
      .finally(() => {
        this.#jobs.delete(tokenId)
      })
    this.#queue = job.catch(() => undefined)
    this.#jobs.set(tokenId, job)
    void job.catch((error: unknown) => {
      console.error('Commemorative NFT generation failed', { tokenId, error })
    })

    return { status: 'started' }
  }

  async waitForIdle(): Promise<void> {
    const jobs = [...this.#jobs.values()]
    const results = await Promise.allSettled(jobs)
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failure) throw failure.reason
  }
}
