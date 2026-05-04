import type { Address } from 'viem'

export const V1_CONTRACTS = {
  BaseRegistrar: '0x6409609247722761b8ba96371485de92a6d7b83b' as Address,
  NameWrapper: '0xc7e033b8836e4bd55d069d113f018b98478cb091' as Address,
  ENSRegistry: '0x7e89b563f936c68c31a360840eb7f9a4aacaf014' as Address,
  PublicResolver: '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as Address,
} as const

export const V2_DEPLOY_BLOCK = 10462885n

// TODO(ensjs): these ENS v2 Sepolia deployment addresses should live in a
// shared `@ensdomains/ensjs` export so every consumer uses one source of
// truth. Remove this local table once the upstream addresses export lands.
export const V2_CONTRACTS = {
  ETHRegistry: '0x31a2bb5d933557cce1b3129993193896d074db92' as Address,
  UnlockedMigrationController:
    '0x5587003f8eeee1bc236d48ab39059cbfd99207d7' as Address,
  LockedMigrationController:
    '0x7ca1ded4d929ebd8b09e24c2da8e909014abecd8' as Address,
  ENSV2Resolver: '0x078a7ae41974a74c62233bca5590c86218aa1f1e' as Address,
  PreMigrationController:
    '0xee63749b063c08dedee9478504177c27bf9193d7' as Address,
  VerifiableFactory: '0x26997c9d0f3dcbae3f78c69e621a3926ee30bb98' as Address,
  PermissionedResolverImpl:
    '0xe566a1fbaf30ff7c39828fe99f955fc55544cb9c' as Address,
} as const
