import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RolesUnavailableMessage } from './RolesUnavailableMessage'

// Asserted as literal paths rather than against the exported constants: the
// base URL is env-dependent, but importing the constant would let a wrong path
// move the assertion with it.

describe('RolesUnavailableMessage', () => {
  it('explains that roles need ENSv2 rather than offering fuses', () => {
    render(<RolesUnavailableMessage name="jooooe.eth" />)

    expect(screen.getByText('Roles not available')).toBeInTheDocument()
    expect(
      screen.getByText(/Roles and permissions are available in ENSv2/),
    ).toBeInTheDocument()
  })

  it('sends the migrate CTA to the manager migration flow', () => {
    render(<RolesUnavailableMessage name="jooooe.eth" />)

    const migrate = screen.getByRole('link', { name: /Upgrade to v2/ })

    expect(migrate.getAttribute('href')).toMatch(/\/migration$/)
  })

  it('labels the learn-more link with the name it is about', () => {
    render(<RolesUnavailableMessage name="jooooe.eth" />)

    const learnMore = screen.getByRole('link', {
      name: 'Learn more about migrating jooooe.eth to ENS v2',
    })

    expect(learnMore.getAttribute('href')).toMatch(/\/ensv2$/)
  })
})
