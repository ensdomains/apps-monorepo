// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
}))

// `Route` is the mocked options object (see createFileRoute above).
const { Route } = await import('./privacy')
const PrivacyPolicyRoute = (
  Route as unknown as { component: () => React.ReactElement }
).component

/**
 * The JSX source's visible text, applying JSX's own whitespace rule
 * (whitespace holding a newline vanishes around tags) before collapsing
 * what remains, so source text compares equal to rendered text.
 */
const visibleText = (jsx: string): string =>
  jsx
    .replace(/>\s+/g, '>')
    .replace(/\s+</g, '<')
    .replace(/<[^>]*>/g, '')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const MANAGER_POLICY_PATH =
  '../../../manager/src/features/legal/pages/PrivacyPolicyPage.tsx'

describe('privacy policy page', () => {
  it('renders the Privacy Policy with the analytics notice last', () => {
    render(<PrivacyPolicyRoute />)
    expect(document.querySelector('main h1')?.textContent).toBe(
      'Privacy Policy',
    )
    const sections = [...document.querySelectorAll('main > section')]
    expect(sections).toHaveLength(9)
    expect(sections[8]?.getAttribute('id')).toBe('analytics')
  })

  it('matches sections 1 to 8 of the checked Manager policy word for word', () => {
    const managerSource = readFileSync(
      new URL(MANAGER_POLICY_PATH, import.meta.url),
      'utf8',
    )
    const start = managerSource.indexOf('1. Introduction')
    const end = managerSource.indexOf('9. Analytics')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const managerText = visibleText(managerSource.slice(start, end))

    render(<PrivacyPolicyRoute />)
    const sections = [...document.querySelectorAll('main > section')]
    expect(sections).toHaveLength(9)
    const portalText = sections
      .slice(0, 8)
      .map((section) => section.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

    expect(portalText).toBe(managerText)
  })
})
