import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Address, labelhash } from 'viem'
import { beforeEach, expect, it, vi } from 'vitest'
import { resourceIdFromChainValue } from '@/lib/resource/resourceId'
import { createTestQueryClient } from '@/test-utils/providers'

const REGISTRY: Address = '0x8C7c50D4400CE8DE9Bc7534CEDf9a7Cc50d87F01'
const RESOURCE = resourceIdFromChainValue(labelhash('admin'))._unsafeUnwrap()
const OWN_EXPIRY = Date.UTC(2099, 9, 13) / 1000

let ownExpiry: number | null = OWN_EXPIRY
const hasRoles = vi.hoisted(() => vi.fn())

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConnection: () => ({
    address: '0x801D2e48d378F161Dba7AD7ad002Ad557714c191',
  }),
}))
vi.mock('@/features/profile/hooks/useRegistrationData', () => ({
  getRegistrationDataQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['registrationData', name],
    queryFn: () => ({
      createdAt: null,
      registeredAt: null,
      expiry: ownExpiry,
      graceEnd: null,
    }),
  }),
}))
vi.mock('@/features/profile/hooks/useFirstToExpire', () => ({
  useFirstToExpire: (names: readonly string[]) => ({
    isLoading: false,
    firstToExpire:
      names.length > 0 ? { name: 'chakri.eth', date: new Date() } : undefined,
  }),
}))
vi.mock('@/features/roles/hooks/useVersionedResource', () => ({
  getVersionedResourceQueryOptions: ({ name }: { name: string }) => ({
    queryKey: ['versionedResource', name],
    queryFn: () => RESOURCE,
  }),
}))
vi.mock('../hooks/useHasRoles', () => ({
  getHasRolesQueryOptions: (params: { roles: readonly string[] }) => ({
    queryKey: ['hasRoles', params.roles],
    queryFn: () => hasRoles(params),
  }),
}))
vi.mock('./ChangeSubnameExpiry', () => ({
  ChangeSubnameExpiry: ({
    parentName,
    subname,
  }: {
    parentName: string
    subname: { name: string; expiryDate: Date }
  }) => (
    <p>{`Changing ${subname.name} under ${parentName} from ${subname.expiryDate.toISOString()}`}</p>
  ),
}))

const { EditSubnameExpiry } = await import('./EditSubnameExpiry')

const renderEdit = (name: string, queryClient = createTestQueryClient()) =>
  render(
    <QueryClientProvider client={queryClient}>
      <EditSubnameExpiry name={name} registryAddress={REGISTRY} />
    </QueryClientProvider>,
  )

beforeEach(() => {
  ownExpiry = OWN_EXPIRY
  hasRoles.mockReset().mockReturnValue(true)
})

it('opens the change for a renewer, asking about ROLE_RENEW on the subname', async () => {
  renderEdit('admin.chakri.eth')

  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

  expect(
    screen.getByText(
      `Changing admin.chakri.eth under chakri.eth from ${new Date(OWN_EXPIRY * 1000).toISOString()}`,
    ),
  ).toBeInTheDocument()
  expect(hasRoles).toHaveBeenCalledWith(
    expect.objectContaining({
      registryAddress: REGISTRY,
      resource: RESOURCE,
      roles: ['ROLE_RENEW'],
    }),
  )
})

it('greys Edit out and says why for a subname with no expiry of its own', async () => {
  ownExpiry = null
  renderEdit('right.chakri.eth')

  const edit = await screen.findByRole('button', { name: 'Edit' })
  expect(edit).toHaveAttribute('aria-disabled', 'true')
  await userEvent.hover(edit)

  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'It stays active as long as chakri.eth does.',
  )
})

it('reads nothing for a 2LD, which renews through the registrar', () => {
  const queryClient = createTestQueryClient()
  renderEdit('chakri.eth', queryClient)

  expect(queryClient.isFetching()).toBe(0)
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
})
