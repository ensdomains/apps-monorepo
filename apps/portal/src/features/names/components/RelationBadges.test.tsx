import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RelationBadges } from './RelationBadges'

describe('RelationBadges', () => {
  it('counts the roles held on an ENSv2 name', () => {
    render(<RelationBadges relations={['owner', 'manager']} roleCount={5} />)

    expect(screen.getByText('5 Roles')).toBeInTheDocument()
    expect(screen.queryByText('Owner')).not.toBeInTheDocument()
  })

  it('names the relations when no role count is known', () => {
    render(<RelationBadges relations={['owner', 'manager']} />)

    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('Manager')).toBeInTheDocument()
  })
})
