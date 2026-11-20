import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PaletteDeveloperTools } from './PaletteDeveloperTools'

vi.mock('@ens-apps/dev-time-travel', () => ({
  isTimeTravelEnabled: () => true,
  TimeTravelPanelContent: () => null,
}))
vi.mock('@ens-apps/dev-migration-tool', () => ({
  isMigrationToolEnabled: () => true,
  MigrationPanelContent: () => null,
}))
vi.mock('@ens-apps/dev-dqa-overlay', () => ({
  isDQAEnabled: () => false,
  getDqaTheme: () => 'dark',
  subscribeDqaTheme: () => () => {},
  toggleDqaTheme: () => {},
}))

const Harness = () => {
  const [tool, setTool] = useState<'migration' | undefined>(undefined)
  return (
    <>
      <button type="button" onClick={() => setTool('migration')}>
        Open migration
      </button>
      <PaletteDeveloperTools tool={tool} onClose={() => setTool(undefined)} />
    </>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    callback()
    return 1
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('opens the existing developer drawer on the requested tab instead of creating a second dialog', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  window.dispatchEvent(new Event('load'))
  await user.click(screen.getByRole('button', { name: 'Open migration' }))
  expect(
    await screen.findByRole('region', { name: 'ENS dev tools' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /Migration/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(screen.getByRole('tab', { name: /Time travel/ })).toHaveAttribute(
    'aria-selected',
    'false',
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
