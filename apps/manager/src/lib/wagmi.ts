import { createParaConnector } from '@getpara/wagmi-v2-connector'
import { ParaWeb } from '@getpara/web-sdk'
import { injected } from '@wagmi/core'
import { createAtom } from '@xstate/store'
import { http } from 'viem'
import { mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'

const para = new ParaWeb('beta_2996c2e68bb6304f19eb12b0288ffbff')

const paraConnector = createParaConnector({
  para,
  appName: 'demo',
  options: {},
  renderModal: (onClose) => {
    paraModalOpenAtom.subscribe((value) => {
      if (!value) {
        onClose()
        console.log('Told para modal to close')
      }
    })

    return {
      openModal: () => paraModalOpenAtom.set(true),
    }
  },
})

export const paraModalOpenAtom = createAtom(false)

export const wagmiConfig = createConfig({
  syncConnectedChain: false,
  ssr: true,
  multiInjectedProviderDiscovery: true,
  chains: [mainnet],
  transports: {
    1: http(
      'https://lb.drpc.org/ogrpc?network=ethereum&dkey=AgBISc2US0WgjMYhz9MRMJZsJaE8hzcR76fgOpXEh2H0',
    ),
  },
  connectors: [
    paraConnector as any,
    injected(),
    walletConnect({
      projectId: '21fef48091f12692cad574a6f7753643',
      name: 'WalletConnect',
    }),
  ],
})

export type ClientType = ReturnType<typeof wagmiConfig.getClient>
export type ChainType = ClientType['chain']
