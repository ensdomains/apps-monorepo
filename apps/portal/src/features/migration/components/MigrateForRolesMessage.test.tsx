import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MigrateForRolesMessage } from './MigrateForRolesMessage'

// Asserted as literal paths rather than against the exported constants: the
// base URL is env-dependent, but importing the constant would let a wrong path
// move the assertion with it.
describe('MigrateForRolesMessage', () => {
  it('asks the holder to migrate, alongside the buttons that do it', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate />)

    expect(screen.getByText('Fuses not available')).toBeInTheDocument()
    expect(screen.getByText(/Migrate this name to v2/)).toBeInTheDocument()
  })

  it('sends the migrate CTA to the manager migration flow', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate />)

    const migrate = screen.getByRole('link', { name: /Upgrade to v2/ })

    expect(migrate.getAttribute('href')).toMatch(/\/migration$/)
  })

  it('labels the learn-more link with the name it is about', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate />)

    const learnMore = screen.getByRole('link', {
      name: 'Learn more about migrating jooooe.eth to ENS v2',
    })

    expect(learnMore.getAttribute('href')).toMatch(/\/ensv2$/)
  })

  // Without the buttons, "Migrate this name" is an instruction the viewer
  // cannot carry out, so the same fact is stated rather than asked of them.
  it('states the fact instead of instructing a viewer who cannot migrate', () => {
    render(<MigrateForRolesMessage name="jooooe.eth" canMigrate={false} />)

    expect(screen.getByText('Fuses not available')).toBeInTheDocument()
    expect(
      screen.getByText(/would need to be migrated to v2/),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/Migrate this name to v2/),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
