import { getCoinTypeForReverseRegistrarChainId } from '@ens-apps/l2-primary/v1'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EVM_COIN_TYPE, MAINNET_COIN_TYPE } from '@/lib/coinType'
import type { ReverseResolutionResult } from '../../hooks/useReverseResolution'
import { columns } from './columns'

/** Base Sepolia — an L2 row, so one that inherits `default.reverse`. */
const L2_COIN_TYPE = getCoinTypeForReverseRegistrarChainId(8453, 'sepolia')

const l2Row = (
  overrides: Partial<ReverseResolutionResult>,
): ReverseResolutionResult => ({
  coinType: L2_COIN_TYPE,
  label: 'Base Sepolia',
  icon: '',
  name: null,
  reverseResolverAddress: null,
  resolverAddress: null,
  normalized: true,
  forwardMatch: false,
  defaultName: null,
  defaultForwardMatch: false,
  ...overrides,
})

/**
 * Renders the real column definitions through a real table, so the cells under
 * test are the ones the route renders rather than hand-called `cell` functions.
 * Each `data` array is a module-scope constant, which keeps the row model
 * stable across the commits a render triggers.
 */
const Harness = ({ data }: { data: ReverseResolutionResult[] }) => {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const UNVERIFIED_DEFAULT = [
  l2Row({ defaultName: 'someone-elses.eth', defaultForwardMatch: false }),
]
const VERIFIED_DEFAULT = [
  l2Row({ defaultName: 'mine.eth', defaultForwardMatch: true }),
]
const OWN_UNVERIFIED_RECORD = [
  l2Row({ name: 'alice.eth', forwardMatch: false }),
]
const NEVER_INHERITS = [
  l2Row({
    coinType: DEFAULT_EVM_COIN_TYPE,
    label: 'Default',
    defaultName: 'someone-elses.eth',
  }),
  l2Row({
    coinType: MAINNET_COIN_TYPE,
    label: 'Mainnet',
    defaultName: 'someone-elses.eth',
  }),
]

describe('reverse resolution columns', () => {
  // WEB-1428: `default.reverse` is writable by anyone for any name, so an
  // inherited name whose forward `addr` resolves elsewhere is a claim, not a
  // verified primary name.
  it('marks an inherited default that does not forward-resolve back as unverified', () => {
    render(<Harness data={UNVERIFIED_DEFAULT} />)

    expect(screen.getByText('someone-elses.eth')).toBeInTheDocument()
    expect(screen.getByText('Unverified')).toBeInTheDocument()
    expect(screen.getByText('False')).toBeInTheDocument()
    expect(screen.queryByText('Primary name')).not.toBeInTheDocument()
    expect(screen.queryByText('True')).not.toBeInTheDocument()
  })

  it('marks an inherited default that does forward-resolve back as verified', () => {
    render(<Harness data={VERIFIED_DEFAULT} />)

    expect(screen.getByText('True')).toBeInTheDocument()
    expect(screen.getByText('Primary name')).toBeInTheDocument()
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument()
  })

  it("leaves a row's own unverified record reporting False", () => {
    render(<Harness data={OWN_UNVERIFIED_RECORD} />)

    expect(screen.getByText('False')).toBeInTheDocument()
    expect(screen.queryByText('Primary name')).not.toBeInTheDocument()
  })

  it('shows no inherited name at all on the Default and Mainnet rows', () => {
    render(<Harness data={NEVER_INHERITS} />)

    expect(screen.queryByText('someone-elses.eth')).not.toBeInTheDocument()
    expect(screen.queryByText('Unverified')).not.toBeInTheDocument()
    expect(screen.getAllByText('null')).toHaveLength(2)
  })
})
