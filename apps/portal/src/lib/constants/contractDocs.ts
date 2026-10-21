/** Where each contract page's Docs row points, per WEB-695. */
export const CONTRACT_DOCS = {
  registry: 'https://docs.ens.domains/contracts/ensv2/overview/',
  resolver: 'https://docs.ens.domains/resolvers/quickstart/',
} as const

/** The docs row shows the address without its scheme, as the design does. */
export const formatDocsHref = (href: string): string =>
  href.replace(/^https?:\/\//, '').replace(/\/$/, '')
