import { env } from 'cloudflare:workers'
import type { EnsNetwork } from '@ens-apps/config'

/** Deployment facts every email template renders with. */
export interface EmailContext {
  readonly network: EnsNetwork
  /** Host of the manager app, shown as text for the reader to type. */
  readonly appHost: string
  /** Absolute URL of the logo, served from this worker's static assets. */
  readonly logoUrl: string
}

interface EmailContextInput {
  readonly network: EnsNetwork
  readonly managerAppUrl: string
  readonly workerBaseUrl: string
}

// Kept stable (not content-hashed) because emails sit in inboxes for years
// and must not lose their logo when the asset changes.
const LOGO_PATH = '/email/ens-logo.png'

export const buildEmailContext = ({
  network,
  managerAppUrl,
  workerBaseUrl,
}: EmailContextInput): EmailContext => ({
  network,
  appHost: new URL(managerAppUrl).host,
  logoUrl: new URL(LOGO_PATH, workerBaseUrl).toString(),
})

export const getEmailContext = (): EmailContext =>
  buildEmailContext({
    network: env.CHAIN,
    managerAppUrl: env.MANAGER_APP_URL,
    workerBaseUrl: env.BASE_URL,
  })

export const isTestnet = (context: EmailContext): boolean =>
  context.network !== 'mainnet'

/** "Sepolia" for a testnet; used in the subject, sender name and banner. */
export const networkLabel = (context: EmailContext): string =>
  context.network.charAt(0).toUpperCase() + context.network.slice(1)
