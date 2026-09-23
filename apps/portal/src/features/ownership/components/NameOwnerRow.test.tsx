import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { V1NameState } from '@/features/transfer/v1/getV1NameState'
import { createTestWrapper } from '@/test-utils'

const REGISTRANT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const CONTROLLER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
/** jobintime.xyz: the `_ens` TXT address, and the v1 registry entry it set. */
const DNS_OWNER = '0xFc5958B4B6F9a06D21E06429c8833f865577acf0'
const DNS_MANAGER = '0x55e55C649895940826a852820d9e1A076Ec47b09'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  }
})

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wagmi')>()
  return {
    ...actual,
    useConnection: () => ({ address: undefined }),
    // No primary name, so the row shows the truncated address.
    useEnsName: () => ({ data: null, error: null, isLoading: false }),
  }
})

const v1StateQuery: {
  data: V1NameState | undefined
  isLoading: boolean
  error: unknown
} = {
  data: undefined,
  isLoading: false,
  error: null,
}

const dnsOwnerQuery: { data: string | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
}

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useIsFetching: () => 0,
    useQuery: (options: { queryKey: readonly unknown[] }) => {
      if (options.queryKey[0] === 'transfer-v1-name-state') return v1StateQuery
      if (options.queryKey[0] === 'dns-owner')
        return { ...dnsOwnerQuery, error: null, isRefetching: false }
      return { data: undefined, isLoading: false, error: null }
    },
  }
})

const { NameOwnerRow } = await import('./NameOwnerRow')

const v1State = (subject: V1NameState['subject']): V1NameState => ({
  subject,
  registration: subject ? 'active' : 'gracePeriod',
  resolverAddress: null,
  parent: null,
  ancestorRegistration: null,
})

const rowFor = (label: string) =>
  screen.getByText(label).closest('div')?.parentElement

const ownerRow = () => rowFor('Owner')

const renderRow = (ui: React.ReactElement) =>
  render(ui, { wrapper: createTestWrapper() })

describe('NameOwnerRow', () => {
  beforeEach(() => {
    Object.assign(v1StateQuery, {
      data: undefined,
      isLoading: false,
      error: null,
    })
    Object.assign(dnsOwnerQuery, { data: undefined, isLoading: false })
  })

  it('names the registrant, not the controller, for an unwrapped V1 2LD', () => {
    v1StateQuery.data = v1State({
      kind: 'v1-registrar',
      registrant: REGISTRANT,
      controller: CONTROLLER,
    })

    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv1"
      />,
    )

    expect(ownerRow()).toHaveTextContent('0x7099…79C8')
    expect(ownerRow()).not.toHaveTextContent('0xf39F…2266')
  })

  it('names the wrapper owner for a wrapped V1 name', () => {
    v1StateQuery.data = v1State({
      kind: 'v1-wrapped',
      owner: REGISTRANT,
      fuses: {
        cannotTransfer: false,
        cannotSetResolver: false,
        cannotUnwrap: false,
        parentCannotControl: false,
      },
      expiry: null,
    })

    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv1"
      />,
    )

    expect(ownerRow()).toHaveTextContent('0x7099…79C8')
  })

  // In grace the 721 `ownerOf` reverts, so no registrant is left to show.
  it('falls back to the registry owner once the name has lapsed', () => {
    v1StateQuery.data = v1State(null)

    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv1"
      />,
    )

    expect(ownerRow()).toHaveTextContent('0xf39F…2266')
  })

  it('reports a failed V1 read instead of showing the controller as owner', () => {
    v1StateQuery.error = new Error('boom')

    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv1"
      />,
    )

    expect(screen.getByText('Failed to load owner')).toBeInTheDocument()
    expect(screen.queryByText('0xf39F…2266')).not.toBeInTheDocument()
  })

  it('shows a loading row, not the controller, while the V1 read is in flight', () => {
    v1StateQuery.isLoading = true

    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv1"
      />,
    )

    expect(ownerRow()).toHaveTextContent('Loading')
    expect(screen.queryByText('0xf39F…2266')).not.toBeInTheDocument()
  })

  it('reports no owner rather than the controller when the V1 read returned nothing', () => {
    v1StateQuery.data = undefined

    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv1"
      />,
    )

    expect(ownerRow()).toHaveTextContent('Owner unavailable')
    expect(screen.queryByText('0xf39F…2266')).not.toBeInTheDocument()
  })

  it('uses the resolved owner directly for a V2 name', () => {
    renderRow(
      <NameOwnerRow
        name="alice.eth"
        owner={CONTROLLER}
        protocolVersion="ENSv2"
      />,
    )

    expect(ownerRow()).toHaveTextContent('0xf39F…2266')
  })

  // WEB-125: for an imported DNS name the v1 registry entry is the *manager*,
  // a role the `_ens` address can reclaim at any time. Naming it "Owner"
  // overstated it, so the row names the DNS Owner under its own label.
  describe('imported DNS name', () => {
    const renderDnsRow = () =>
      renderRow(
        <NameOwnerRow
          name="jobintime.xyz"
          owner={DNS_MANAGER}
          protocolVersion="ENSv1"
        />,
      )

    it('names the DNS owner, never the manager, as the owner', () => {
      dnsOwnerQuery.data = DNS_OWNER

      renderDnsRow()

      expect(rowFor('DNS owner')).toHaveTextContent('0xFc59…acf0')
      expect(screen.queryByText('Owner')).not.toBeInTheDocument()
      expect(screen.queryByText('0x55e5…7b09')).not.toBeInTheDocument()
    })

    it('says the record is unreadable rather than showing the manager', () => {
      // A non-strict lookup returns null on any failure — that must not
      // silently promote the manager back into the Owner row.
      dnsOwnerQuery.data = undefined

      renderDnsRow()

      expect(screen.getByText(/Could not read the domain/)).toBeInTheDocument()
      expect(screen.queryByText('0x55e5…7b09')).not.toBeInTheDocument()
    })

    it('waits for the record instead of flashing an unknown owner', () => {
      dnsOwnerQuery.isLoading = true

      renderDnsRow()

      expect(rowFor('DNS owner')).toHaveTextContent('Loading')
    })
  })
})
