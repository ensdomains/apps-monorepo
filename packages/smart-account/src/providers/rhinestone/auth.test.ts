import { describe, expect, it } from 'vitest'
import { rhinestoneAuthHeaders, toSdkAuth } from './auth'

describe('toSdkAuth', () => {
  it('passes an api key through as the SDK api-key mode', () => {
    expect(toSdkAuth({ mode: 'apiKey', apiKey: 'rs_test' })).toEqual({
      mode: 'apiKey',
      apiKey: 'rs_test',
    })
  })

  it('hands the token getter to the SDK jwt mode, uncalled', () => {
    const getAccessToken = async () => 'token'

    expect(toSdkAuth({ mode: 'jwt', getAccessToken })).toEqual({
      mode: 'experimental_jwt',
      accessToken: getAccessToken,
    })
  })
})

describe('rhinestoneAuthHeaders', () => {
  it('sends the api key as x-api-key', async () => {
    await expect(
      rhinestoneAuthHeaders({ mode: 'apiKey', apiKey: 'rs_test' }),
    ).resolves.toEqual({ 'x-api-key': 'rs_test' })
  })

  it('sends a bearer token the way the SDK does', async () => {
    await expect(
      rhinestoneAuthHeaders({ mode: 'jwt', getAccessToken: async () => 'tok' }),
    ).resolves.toEqual({ Authorization: 'Bearer tok', 'x-api-key': 'jwt' })
  })
})
