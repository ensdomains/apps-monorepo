import { describe, expect, it } from 'vitest'
import { readNoticeBanner } from './noticeBanner'

const MAINNET = { app: 'manager', chainId: 1 } as const
const SEPOLIA = { app: 'manager', chainId: 11155111 } as const

describe('readNoticeBanner', () => {
  it('returns the entry for the app and chain, defaulting the variant', () => {
    const payload = {
      manager: {
        '1': { message: ' Mainnet notice ', variant: 'danger' },
        '11155111': { message: 'Sepolia notice', variant: 'bogus' },
      },
    }
    expect(readNoticeBanner(payload, MAINNET)).toEqual({
      message: 'Mainnet notice',
      variant: 'danger',
      id: 'manager/1/danger/Mainnet notice',
    })
    expect(readNoticeBanner(payload, SEPOLIA)).toEqual({
      message: 'Sepolia notice',
      variant: 'warning',
      id: 'manager/11155111/warning/Sepolia notice',
    })
  })

  it('returns null when the flag is off or nothing targets this app and chain', () => {
    expect(readNoticeBanner(undefined, MAINNET)).toBeNull()
    expect(readNoticeBanner(false, MAINNET)).toBeNull()
    expect(
      readNoticeBanner({ explorer: { '1': { message: 'x' } } }, MAINNET),
    ).toBeNull()
    expect(
      readNoticeBanner({ manager: { '11155111': { message: 'x' } } }, MAINNET),
    ).toBeNull()
    expect(readNoticeBanner({ manager: { '1': 'plain' } }, MAINNET)).toBeNull()
    expect(
      readNoticeBanner({ manager: { '1': { message: '  ' } } }, MAINNET),
    ).toBeNull()
  })
})
