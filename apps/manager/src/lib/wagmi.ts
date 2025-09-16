import { createParaConnector } from '@getpara/wagmi-v2-connector'
import { injected } from '@wagmi/core'
import { http } from 'viem'
import { mainnet } from 'viem/chains'
import { createConfig } from 'wagmi'
import { walletConnect } from 'wagmi/connectors'
import { para, paraMachine } from '@/features/wallet/machines/para'

const paraConnector = createParaConnector({
  para,
  appName: 'demo',
  options: {},
  renderModal: (onClose) => {
    paraMachine.subscribe(({ value }) => {
      if (value === 'closed') {
        onClose()
      }
    })

    return {
      openModal: () => paraMachine.send({ type: 'OPEN' }),
    }
  },
})

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
