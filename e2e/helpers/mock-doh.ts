/**
 * DNS-over-HTTPS mocking for DNS-import e2e tests.
 *
 * The portal's DNS checks (`getDnsSecEnabled`, `getDnsOwner`,
 * `getDnsOffchainData` from ensjs) are plain JSON queries to
 * `https://cloudflare-dns.com/dns-query` — interceptable per test via
 * `page.route`. The dnsprovejs *proof* queries (wire-format,
 * `application/dns-message`) carry real DNSSEC signatures that cannot be
 * forged, so they are answered with 502: proof-dependent UI must show its
 * unavailable state deterministically.
 */
import type { Page } from '@playwright/test'

export const DNS_TYPE = {
  TXT: 16,
  RRSIG: 46,
} as const

export type DohRecord = {
  name: string
  type: number
  TTL: number
  data: string
}

export type DohResponse = {
  Status: number
  TC: boolean
  RD: boolean
  RA: boolean
  AD: boolean
  CD: boolean
  Question: { name: string; type: number }[]
  Answer?: DohRecord[]
}

const baseResponse = (
  name: string,
  overrides: Partial<DohResponse>,
): DohResponse => ({
  Status: 0,
  TC: false,
  RD: true,
  RA: true,
  AD: true,
  CD: false,
  Question: [{ name: `${name}.`, type: DNS_TYPE.TXT }],
  ...overrides,
})

/** NOERROR + AD with the given answers (DNSSEC-validated result). */
export const dohSecure = (name: string, answers: DohRecord[]): DohResponse =>
  baseResponse(name, { Answer: answers })

/** NOERROR without the AD flag — DNSSEC not enabled / validation failed. */
export const dohInsecure = (name: string): DohResponse =>
  baseResponse(name, { AD: false, Answer: [] })

/** NXDOMAIN — the queried name does not exist. */
export const dohNxDomain = (name: string): DohResponse =>
  baseResponse(name, { Status: 3 })

/**
 * A validated `ENS1` TXT answer for `name`, in the shape ensjs's
 * `getDnsOffchainData` expects: the quoted TXT record plus an RRSIG whose
 * label count matches (wildcard-expansion check).
 */
export const ens1Answers = (
  name: string,
  resolver: string,
  context: string,
): DohRecord[] => [
  {
    name,
    type: DNS_TYPE.TXT,
    TTL: 300,
    data: `"ENS1 ${resolver} ${context}"`,
  },
  {
    name,
    type: DNS_TYPE.RRSIG,
    TTL: 300,
    data: `TXT 13 ${name.split('.').length} 300 20330101000000 20240101000000 12345 ${name}. e2emocksig==`,
  },
]

/** The `_ens.<domain>` TXT answer (`a=<address>`) read by `getDnsOwner`. */
export const ensOwnerAnswers = (
  domain: string,
  ownerAddress: string,
): DohRecord[] => [
  {
    name: `_ens.${domain}`,
    type: DNS_TYPE.TXT,
    TTL: 300,
    data: `"a=${ownerAddress}"`,
  },
]

/**
 * Intercept all DoH traffic on the page. `respond` receives the queried name
 * (trailing dot stripped) and returns the JSON body to serve.
 */
export async function mockDnsOverHttps(
  page: Page,
  respond: (qname: string) => DohResponse,
): Promise<void> {
  await page.route('https://cloudflare-dns.com/**', (route) => {
    const request = route.request()
    const accept = request.headers().accept ?? ''
    if (!accept.includes('application/dns-json')) {
      return route.fulfill({
        status: 502,
        headers: { 'access-control-allow-origin': '*' },
        body: 'wire-format DNS is not mocked in e2e',
      })
    }
    const url = new URL(request.url())
    const qname = (url.searchParams.get('name') ?? '').replace(/\.$/, '')
    return route.fulfill({
      status: 200,
      contentType: 'application/dns-json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(respond(qname)),
    })
  })
}
