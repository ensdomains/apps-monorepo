import { RhinestoneSDK } from '@rhinestone/sdk'
import { type RhinestoneAuth, toSdkAuth } from './auth'

/** An SDK client that reads each chain over the RPC given for its id. */
export function createRhinestoneSdk(params: {
  readonly auth: RhinestoneAuth
  readonly endpointUrl?: string
  readonly rpcUrls: Readonly<Record<number, string>>
}): RhinestoneSDK {
  return new RhinestoneSDK({
    auth: toSdkAuth(params.auth),
    provider: { type: 'custom', urls: { ...params.rpcUrls } },
    ...(params.endpointUrl ? { endpointUrl: params.endpointUrl } : {}),
  })
}
