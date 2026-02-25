import { describe, expect, it } from 'vitest'
import { shouldCreateExternalDeliveriesForNotification } from './create'

describe('shouldCreateExternalDeliveriesForNotification', () => {
  it('gates name-expiry delivery by watch reason and preference toggles', () => {
    const payload = {
      name: 'example.eth',
      expiryDate: Date.now(),
      isOwner: true,
      watchReason: 'owned' as const,
    }

    expect(
      shouldCreateExternalDeliveriesForNotification('name-expiry', payload, {
        owned_name_expiry: true,
        favourited_name_expiry: false,
        ens_labs_updates: false,
      }),
    ).toBe(true)

    expect(
      shouldCreateExternalDeliveriesForNotification('name-expiry', payload, {
        owned_name_expiry: false,
        favourited_name_expiry: false,
        ens_labs_updates: false,
      }),
    ).toBe(false)
  })

  it('does not create external deliveries for delivery.mode=none kinds', () => {
    expect(
      shouldCreateExternalDeliveriesForNotification(
        'name-transferred',
        {
          name: 'example.eth',
          txHash: '0xabc',
          to: '0x1234',
        },
        {
          owned_name_expiry: true,
          favourited_name_expiry: true,
          ens_labs_updates: true,
        },
      ),
    ).toBe(false)
  })
})
