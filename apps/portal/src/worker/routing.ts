import { truncateAddress } from '../utils/formatting/truncateAddress'

export const STATIC_PATH_PREFIXES = [
  '/assets/',
  '/og/',
  '/addr/',
  '/favicon',
  '/manifest',
  '/logo',
] as const

export function isAddressRoute(pathname: string): boolean {
  const match = pathname.match(/^\/addr\/(0x[0-9a-fA-F]{40})$/)
  return !!match
}

export function isAddrSubpage(pathname: string): boolean {
  const match = pathname.match(/^\/addr\/(0x[0-9a-fA-F]{40})\/[^/]+$/)
  return !!match
}

export function extractAddrFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/addr\/(0x[0-9a-fA-F]{40})/)
  return match ? match[1] : null
}

export function extractNameFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/')) return null
  const segments = pathname.slice(1).split('/')
  if (segments.length < 1 || segments[0] === '') return null

  const name = segments[0]

  for (const prefix of STATIC_PATH_PREFIXES) {
    if (pathname.startsWith(prefix)) return null
  }

  if (name.includes('.') && !name.endsWith('.eth')) return null

  return name
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

export { truncateAddress }
