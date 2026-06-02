import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { performLogoutCleanup } from './logout-cleanup'

describe('performLogoutCleanup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('removes manager-owned keys explicitly listed', () => {
    localStorage.setItem('@manager-v4/backend_auth', '{"authKey":"abc"}')
    localStorage.setItem('@manager-v4/search_history', '{"history":[]}')
    localStorage.setItem('ens_commitment', '0xcommit')
    localStorage.setItem('ens_secret', '0xsecret')
    localStorage.setItem('ens_name', 'vitalik')
    localStorage.setItem('ens_duration', '1')
    localStorage.setItem('ens_commit_tx_hash', '0xhash1')
    localStorage.setItem('ens_register_tx_hash', '0xhash2')
    localStorage.setItem('ens_owner_address', '0xaddr')

    performLogoutCleanup()

    expect(localStorage.getItem('@manager-v4/backend_auth')).toBeNull()
    expect(localStorage.getItem('@manager-v4/search_history')).toBeNull()
    expect(localStorage.getItem('ens_commitment')).toBeNull()
    expect(localStorage.getItem('ens_secret')).toBeNull()
    expect(localStorage.getItem('ens_name')).toBeNull()
    expect(localStorage.getItem('ens_duration')).toBeNull()
    expect(localStorage.getItem('ens_commit_tx_hash')).toBeNull()
    expect(localStorage.getItem('ens_register_tx_hash')).toBeNull()
    expect(localStorage.getItem('ens_owner_address')).toBeNull()
  })

  it('removes keys matching manager-owned prefixes', () => {
    localStorage.setItem('@manager-v4/anything-else', '1')
    localStorage.setItem('@manager-v4/feature-x', '2')
    localStorage.setItem('wallet_verified_0xabc', 'true')
    localStorage.setItem(
      'wallet_signature_0xdef',
      JSON.stringify({ signature: '0xsig' }),
    )
    localStorage.setItem('ens-session-skipped-0x123', 'true')
    localStorage.setItem('ens-session-skipped-0x456', 'true')

    performLogoutCleanup()

    expect(localStorage.getItem('@manager-v4/anything-else')).toBeNull()
    expect(localStorage.getItem('@manager-v4/feature-x')).toBeNull()
    expect(localStorage.getItem('wallet_verified_0xabc')).toBeNull()
    expect(localStorage.getItem('wallet_signature_0xdef')).toBeNull()
    expect(localStorage.getItem('ens-session-skipped-0x123')).toBeNull()
    expect(localStorage.getItem('ens-session-skipped-0x456')).toBeNull()
  })

  it('wipes every ens-sessions-v* key (current and stale versions)', () => {
    localStorage.setItem('ens-sessions-v2', '[]')
    localStorage.setItem('ens-sessions-v4', '[]')
    localStorage.setItem('ens-sessions-v6', '[]')
    localStorage.setItem('ens-sessions-v99', '[]')

    performLogoutCleanup()

    expect(localStorage.getItem('ens-sessions-v2')).toBeNull()
    expect(localStorage.getItem('ens-sessions-v4')).toBeNull()
    expect(localStorage.getItem('ens-sessions-v6')).toBeNull()
    expect(localStorage.getItem('ens-sessions-v99')).toBeNull()
  })

  it('preserves keys that are not manager-owned', () => {
    const preserved: Array<[string, string]> = [
      ['ph_phc_hDnz5mVAqDQTJ23yNPW3viwJMi3bp2YLuxsAuafisIR_posthog', 'sess'],
      ['@ens/audit-trail', '{"transitions":[]}'],
      ['ens-tx-storage-type', 'indexeddb'],
      ['wagmi.recentConnectorId', '"metaMask"'],
      ['wagmi.store', '{}'],
      ['@appkit/active_caip_network_id', '"eip155:1"'],
      ['@appkit/disconnected_connector_ids', '[]'],
      ['@appkit/connection_status', '"disconnected"'],
      ['@appkit/active_namespace', '"eip155"'],
      ['@PARA/modalState', '{}'],
      ['@PARA/provider-state', '{}'],
      ['@CAPSULE/currentWalletIds', '[]'],
      ['@CAPSULE/wallets', '[]'],
      ['@CAPSULE/externalWallets', '[]'],
      ['tx-12345', '{"id":"12345"}'],
      ['tx-history', '[]'],
      ['migration-modal-dismissed', 'true'],
      ['some-unrelated-app-key', 'value'],
    ]
    for (const [key, value] of preserved) {
      localStorage.setItem(key, value)
    }

    performLogoutCleanup()

    for (const [key, value] of preserved) {
      expect(localStorage.getItem(key), `should preserve "${key}"`).toBe(value)
    }
  })

  it('does not throw when localStorage is empty', () => {
    expect(() => performLogoutCleanup()).not.toThrow()
  })

  it('uses the provided Storage instance instead of the global one', () => {
    const fakeStorage: Record<string, string> = {}
    const stub = new Proxy(fakeStorage, {
      get(target, prop) {
        if (prop === 'getItem') {
          return (key: string) => target[key] ?? null
        }
        if (prop === 'setItem') {
          return (key: string, value: string) => {
            target[key] = value
          }
        }
        if (prop === 'removeItem') {
          return (key: string) => {
            delete target[key]
          }
        }
        if (prop === 'clear') return () => {}
        if (prop === 'key') return () => null
        if (prop === 'length') return Object.keys(target).length
        return undefined
      },
      has(target, prop) {
        return typeof prop === 'string' && prop in target
      },
      ownKeys(target) {
        return Object.keys(target)
      },
      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && prop in target) {
          return { enumerable: true, configurable: true, value: target[prop] }
        }
        return undefined
      },
    }) as Storage

    fakeStorage['ens-sessions-v4'] = '[]'
    fakeStorage.ph_phc_x_posthog = 'sess'

    performLogoutCleanup(stub)

    expect(fakeStorage['ens-sessions-v4']).toBeUndefined()
    expect(fakeStorage.ph_phc_x_posthog).toBe('sess')
  })
})
