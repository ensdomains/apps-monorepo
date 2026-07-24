export type GenerationRequestResult =
  | { readonly status: 'accepted' }
  | { readonly status: 'generated' }
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'failed'
      readonly responseStatus: number
    }

export const requestTokenGeneration = async (params: {
  readonly generatorToken?: string
  readonly generatorUrl?: string
  readonly tokenId: string
  readonly fetcher?: typeof fetch
}): Promise<GenerationRequestResult> => {
  const generatorUrl = params.generatorUrl?.trim()
  if (!generatorUrl) return { status: 'unavailable' }

  const endpoint = new URL(`/v1/tokens/${params.tokenId}/prepare`, generatorUrl)
  const headers = new Headers({ Accept: 'application/json' })
  const generatorToken = params.generatorToken?.trim()
  if (generatorToken) {
    headers.set('Authorization', `Bearer ${generatorToken}`)
  }

  const response = await (params.fetcher ?? fetch)(endpoint, {
    method: 'POST',
    headers,
  })

  if (response.status === 202 || response.status === 409) {
    return { status: 'accepted' }
  }
  if (response.ok) return { status: 'generated' }

  return {
    status: 'failed',
    responseStatus: response.status,
  }
}
