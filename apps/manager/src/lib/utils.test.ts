import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('lets shadow-none override the custom card shadows', () => {
    expect(cn('shadow-temp-card', 'shadow-none')).toBe('shadow-none')
    expect(cn('shadow-domain-card', 'shadow-none')).toBe('shadow-none')
  })

  it('keeps a responsive custom shadow alongside the base override', () => {
    expect(cn('shadow-temp-card', 'shadow-none md:shadow-temp-card')).toBe(
      'shadow-none md:shadow-temp-card',
    )
  })
})
