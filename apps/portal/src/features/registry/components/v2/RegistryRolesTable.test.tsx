import { render, screen } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegistryRootRoles } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { RegistryRolesTable } from './RegistryRolesTable'

const registry: Address = '0x1111111111111111111111111111111111111111'
const holder: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'

let roles: RegistryRootRoles

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useWalletClient: () => ({ data: undefined }),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQuery: (options: { queryKey: readonly unknown[] }) =>
      options.queryKey[0] === 'get-registry-root-role-holders'
        ? { data: roles, isLoading: false, error: null }
        : { data: undefined, isLoading: false, error: null },
  }
})

vi.mock('@/features/roles/components/roleTableColumns', async (original) => ({
  ...(await original<
    typeof import('@/features/roles/components/roleTableColumns')
  >()),
  UserCell: ({ account }: { account: Address }) => <span>{account}</span>,
}))

const note = () => screen.queryByText(/operator approval aren't listed/)

describe('RegistryRolesTable', () => {
  beforeEach(() => {
    roles = {
      holders: [{ account: holder, roles: ['ROLE_REGISTRAR'] }],
      areOperatorRolesUnlisted: false,
    }
  })

  it('lists the holders with no note when the list is complete', () => {
    render(<RegistryRolesTable address={registry} disableEdit />)

    expect(screen.getByText(holder)).toBeInTheDocument()
    expect(note()).not.toBeInTheDocument()
  })

  it('notes under the table that operator-held roles are not listed', () => {
    roles = { ...roles, areOperatorRolesUnlisted: true }

    render(<RegistryRolesTable address={registry} disableEdit />)

    expect(screen.getByText(holder)).toBeInTheDocument()
    expect(note()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the note when no holder is listed', () => {
    roles = { holders: [], areOperatorRolesUnlisted: true }

    render(<RegistryRolesTable address={registry} disableEdit />)

    expect(screen.getByText('No role holders yet')).toBeInTheDocument()
    expect(note()).toBeInTheDocument()
  })
})
