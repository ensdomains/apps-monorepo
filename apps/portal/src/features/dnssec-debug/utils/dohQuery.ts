import { dohQuery } from '@ensdomains/dnsprovejs'
import type { DnsQueryFn } from '../types'

type QueryPacket = Parameters<ReturnType<typeof dohQuery>>[0]

// DNS header and EDNS flag bits (RFC 1035 §4.1.1, RFC 4035 §3.2, RFC 3225).
const RECURSION_DESIRED = 1 << 8
const CHECKING_DISABLED = 1 << 4
const DNSSEC_OK = 1 << 15

/**
 * A DNS-over-HTTPS (RFC 8484) query function for one resolver. Always asks
 * for DNSSEC records (DO bit); the debugger toggles CD per query.
 */
export const createDohQueryFn = (url: string): DnsQueryFn => {
  const send = dohQuery(url)
  return ({ name, type, checkingDisabled }) => {
    const packet: QueryPacket = {
      type: 'query',
      id: 0,
      flags: RECURSION_DESIRED | (checkingDisabled ? CHECKING_DISABLED : 0),
      questions: [{ type, class: 'IN', name }],
      additionals: [
        {
          type: 'OPT',
          name: '.',
          udpPayloadSize: 4096,
          extendedRcode: 0,
          ednsVersion: 0,
          flags: DNSSEC_OK,
          flag_do: true,
          options: [],
        },
      ],
      answers: [],
    }
    return send(packet)
  }
}
