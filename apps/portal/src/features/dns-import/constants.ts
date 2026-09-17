import type { Address } from 'viem'

/**
 * Official `ExtendedDNSResolver` deployments — the resolver an `ENS1` TXT
 * record should reference for gasless (offchain) DNS names. On mainnet the
 * canonical `dnsname.ens.eth` name points at that deployment, so the record is
 * displayed in its name form there; other chains have no such name and show
 * the raw address. Verification accepts either form (the resolver in a found
 * record is compared by address after resolution).
 */
export const EXTENDED_DNS_RESOLVER_MAP: Record<number, Address> = {
  1: '0x238A8F792dFA6033814B18618aD4100654aeef01',
  11155111: '0x0EF1aF80c24B681991d675176D9c07d8C9236B9a',
}

/** The resolver value users should put in their `ENS1` TXT record. */
export const getOffchainResolverDisplay = (chainId: number): string =>
  chainId === 1 ? 'dnsname.ens.eth' : (EXTENDED_DNS_RESOLVER_MAP[chainId] ?? '')

type HelpLink = {
  readonly label: string
  readonly href: string
}

/** Registrar guides for enabling DNSSEC on a domain. */
export const DNSSEC_HELP_LINKS: readonly HelpLink[] = [
  {
    label: 'GoDaddy',
    href: 'https://godaddy.com/help/enable-dnssec-on-my-domain-6420',
  },
  {
    label: 'Namecheap',
    href: 'https://www.namecheap.com/support/knowledgebase/article.aspx/9722/2232/managing-dnssec-for-domains-pointed-to-custom-dns/',
  },
  {
    label: 'Dreamhost',
    href: 'https://help.dreamhost.com/hc/en-us/articles/219539467-DNSSEC-overview',
  },
  {
    label: 'Hover',
    href: 'https://help.hover.com/hc/en-us/articles/217281647-DNSSEC-services',
  },
  {
    label: 'Cloudflare',
    href: 'https://developers.cloudflare.com/dns/additional-options/dnssec/#enable-dnssec',
  },
]

/** Registrar guides for adding a TXT record. */
export const DNS_TXT_RECORD_HELPER_LINKS: readonly HelpLink[] = [
  {
    label: 'GoDaddy',
    href: 'https://godaddy.com/help/manage-dns-records-680',
  },
  {
    label: 'Namecheap',
    href: 'https://www.namecheap.com/support/knowledgebase/article.aspx/317/2237/how-do-i-add-txtspfdkimdmarc-records-for-my-domain/',
  },
  {
    label: 'Dreamhost',
    href: 'https://help.dreamhost.com/hc/en-us/articles/360035516812-Adding-custom-DNS-records',
  },
  {
    label: 'Hover',
    href: 'https://help.hover.com/hc/en-us/articles/217282457-Managing-DNS-records-',
  },
  {
    label: 'Cloudflare',
    href: 'https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/',
  },
]
