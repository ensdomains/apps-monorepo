import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectModalProvider } from '@/lib/wallet/stacks/custom/ConnectModalProvider'
import { render } from '@/utils/test-utils'
import { ProfileFavoriteAction } from './ProfileFavoriteAction'

describe('ProfileFavoriteAction', () => {
  it('asks a visitor with no wallet to connect one', async () => {
    render(
      <ConnectModalProvider>
        <ProfileFavoriteAction name="nick.eth" />
      </ConnectModalProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add favorite' }))

    expect(
      await screen.findByRole('dialog', { name: /connect a wallet/i }),
    ).toBeInTheDocument()
  })
})
