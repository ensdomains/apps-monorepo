import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCommemorativeNftTokenId } from '../commemorative-nft/config'
import type { CommemorativeNftEligibility } from '../commemorative-nft/types'
import {
  getPublishedPreviewState,
  type PublishedPreviewQuery,
} from './MigrationSuccessDialogPreview.helpers'

const ownerAddress = '0x1111111111111111111111111111111111111111'
const eligibility: CommemorativeNftEligibility = {
  ownerAddress,
  profileName: 'published-name.eth',
  rendererName: 'published-name',
  proof: ['0x1111111111111111111111111111111111111111111111111111111111111111'],
  traits: {
    Era: 'NFT',
    Depth: 'Collector',
    Gasveteran: 'Seasoned',
    Archetype: 'Personal',
    Rarity: 'Common',
    Seed: 123,
  },
  assets: {
    metadataUrl: 'https://assets.example/token/123.json',
    imageUrl: 'https://assets.example/token/123/image.webp',
    externalUrl: 'https://assets.example/published-name',
  },
  source: 'static',
}
const publishedQuery: PublishedPreviewQuery = {
  data: { status: 'eligible', eligibility },
  error: null,
  isPending: false,
  isError: false,
  fetchStatus: 'idle',
  isFetchedAfterMount: true,
}
const input = { ownerAddress, chainId: 11155111 } as const

describe('published NFT preview state', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('builds the preview directly from published names, traits and assets', () => {
    vi.stubEnv(
      'VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN',
      'https://renderer.example',
    )
    const state = getPublishedPreviewState({ ...input, query: publishedQuery })

    expect(state.status).toBe('readyToMint')
    if (state.status !== 'readyToMint') throw new Error('Expected artwork')
    expect(state.card.eligibility).toBe(eligibility)
    expect(state.card.assets).toBe(eligibility.assets)
    const publicUrl = `https://renderer.example/nft/?tokenId=${getCommemorativeNftTokenId(ownerAddress)}`
    expect(state.card.shareUrls.external).toBe(publicUrl)
    expect(state.card.marketplaceUrl).toBeUndefined()
  })

  it('does not display cached artwork without a verified connected owner', () => {
    const state = getPublishedPreviewState({
      ...input,
      ownerAddress: undefined,
      query: publishedQuery,
    })

    expect(state).toMatchObject({ status: 'error', stage: 'configuration' })
    expect(state).not.toHaveProperty('card')
  })

  it('waits for the first metadata read when the preview opens', () => {
    expect(getPublishedPreviewState(input)).toEqual({
      status: 'loadingEligibility',
    })
    expect(
      getPublishedPreviewState({
        ...input,
        query: {
          ...publishedQuery,
          data: undefined,
          isPending: true,
          isFetchedAfterMount: false,
        },
      }),
    ).toEqual({ status: 'loadingEligibility' })
  })

  it.each([
    { isFetchedAfterMount: false, fetchStatus: 'idle' as const },
    { isFetchedAfterMount: true, fetchStatus: 'fetching' as const },
  ])('withholds cached artwork until its current read finishes: %j', (query) => {
    expect(
      getPublishedPreviewState({
        ...input,
        query: { ...publishedQuery, ...query },
      }),
    ).toEqual({ status: 'loadingEligibility' })
  })

  it('shows a retryable error after metadata validation fails, even with cached data', () => {
    const state = getPublishedPreviewState({
      ...input,
      query: {
        ...publishedQuery,
        isError: true,
        error: new Error('Published NFT metadata request failed with HTTP 503'),
      },
    })

    expect(state).toEqual({
      status: 'error',
      stage: 'eligibility',
      message: 'Published NFT metadata request failed with HTTP 503',
    })
  })

  it('does not wait indefinitely or expose cached artwork while offline', () => {
    expect(
      getPublishedPreviewState({
        ...input,
        query: { ...publishedQuery, fetchStatus: 'paused' },
      }),
    ).toMatchObject({ status: 'error', stage: 'eligibility' })
  })

  it('shows an ineligible state when published metadata is missing', () => {
    expect(
      getPublishedPreviewState({
        ...input,
        query: { ...publishedQuery, data: { status: 'ineligible' } },
      }),
    ).toEqual({ status: 'ineligible' })
  })

  it('shows published metadata without a downloadable image', () => {
    const { imageUrl: _imageUrl, ...assets } = eligibility.assets
    const state = getPublishedPreviewState({
      ...input,
      query: {
        ...publishedQuery,
        data: {
          status: 'eligible',
          eligibility: { ...eligibility, assets },
        },
      },
    })

    expect(state.status).toBe('readyToMint')
    if (state.status !== 'readyToMint') throw new Error('Expected artwork')
    expect(state.card.assets).toEqual(assets)
    expect(state.card.assets.imageUrl).toBeUndefined()
  })

  it('offers retry when the metadata service is unavailable', () => {
    expect(
      getPublishedPreviewState({
        ...input,
        query: { ...publishedQuery, data: { status: 'unavailable' } },
      }),
    ).toMatchObject({ status: 'error', stage: 'eligibility' })
  })

  it('rejects metadata belonging to the prior owner after a wallet change', () => {
    const state = getPublishedPreviewState({
      ...input,
      ownerAddress: '0x2222222222222222222222222222222222222222',
      query: publishedQuery,
    })

    expect(state).toMatchObject({ status: 'error', stage: 'eligibility' })
    expect(state).not.toHaveProperty('card')
  })
})
