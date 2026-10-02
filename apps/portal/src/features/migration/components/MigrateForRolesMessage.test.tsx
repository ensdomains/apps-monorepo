import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MigrateForRolesMessage } from './MigrateForRolesMessage'

// Asserted as literal paths rather than against the exported constants: the
// base URL is env-dependent, but importing the constant would let a wrong path
// move the assertion with it.
describe('MigrateForRolesMessage', () => {
  it('asks the holder to upgrade, alongside the buttons that do it', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate />)

    expect(screen.getByText('Fuses not available')).toBeInTheDocument()
    expect(screen.getByText(/Upgrade this name to v2/)).toBeInTheDocument()
  })

  it('sends the upgrade CTA to the manager upgrade flow', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate />)

    const upgrade = screen.getByRole('link', { name: /Upgrade to v2/ })

    expect(upgrade.getAttribute('href')).toMatch(/\/upgrade$/)
  })

  it('labels the learn-more link with the name it is about', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate />)

    const learnMore = screen.getByRole('link', {
      name: 'Learn more about upgrading jooooe.eth to ENS v2',
    })

    expect(learnMore.getAttribute('href')).toMatch(/\/ensv2$/)
  })

  // Without the buttons, "Upgrade this name" is an instruction the viewer
  // cannot carry out, so the same fact is stated rather than asked of them.
  it('states the fact instead of instructing a viewer who cannot upgrade', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate={false} />)

    expect(screen.getByText('Fuses not available')).toBeInTheDocument()
    expect(
      screen.getByText(/would need to be upgraded to v2/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Upgrade this name to v2/),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
