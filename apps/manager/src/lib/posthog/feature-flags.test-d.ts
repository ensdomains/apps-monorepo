import type { EnsNetwork } from '@ens-apps/config'
import { expectTypeOf, test } from 'vitest'
import type { isMigrationNftEnabled } from './feature-flags'

test('requires a validated ENS network for the NFT gate', () => {
  expectTypeOf<
    Parameters<typeof isMigrationNftEnabled>[0]['network']
  >().toEqualTypeOf<EnsNetwork>()
})
