import { mutationOptions } from '@tanstack/react-query'
import type { WalletClient } from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { backendClient, setBackendAuth } from '@/utils/backend-client'

const getNonce = async () => {
  const response = await backendClient.auth.nonce.$post()
  if (!response.ok) {
    const { error } = await response.json()
    throw new Error(`Failed to get nonce: ${response.statusText} ${error}`)
  }

  return response.json().then((data) => data.nonce)
}

export const signInBackendMutation = mutationOptions({
  mutationFn: async ({ walletClient }: { walletClient: WalletClient }) => {
    const account = walletClient.account

    if (!account || !account.address) {
      throw new Error('No account found')
    }

    const nonce = await getNonce()

    const url = new URL(window.location.origin)

    const siweMessage = createSiweMessage({
      address: account.address,
      // domain: 'app.ens.domains',
      domain: url.hostname,
      nonce,
      chainId: walletClient.chain?.id ?? 0,
      uri: url.origin,
      version: '1',
    })

    const signedMessage = await walletClient.signMessage({
      message: siweMessage,
      account,
    })

    const response = await backendClient.auth.login.$post({
      json: {
        address: account.address,
        message: siweMessage,
        signature: signedMessage,
        nonce,
      },
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(
        `Failed to login: ${response.statusText} ${JSON.stringify(data, null, 2)}`,
      )
    }

    const token = await response.json().then((data) => data.token)

    setBackendAuth(token, account.address)
  },
})
