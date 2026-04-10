import type { Address } from 'viem'

export const V1_CONTRACTS = {
  BaseRegistrar: '0x6409609247722761b8ba96371485de92a6d7b83b' as Address,
  NameWrapper: '0xc7e033b8836e4bd55d069d113f018b98478cb091' as Address,
  ENSRegistry: '0x7e89b563f936c68c31a360840eb7f9a4aacaf014' as Address,
  PublicResolver: '0x640294a2b2d87e7f522db3e3e3e876764bce170d' as Address,
} as const

export const MULTICALL3_ADDRESS: Address =
  '0xcA11bde05977b3631167028862bE2a173976CA11'

export const V2_CONTRACTS = {
  ETHRegistry: '0x796fff2e907449be8d5921bcc215b1b76d89d080' as Address,
  ETHRegistrar: '0x68586418353b771cf2425ed14a07512aa880c532' as Address,
  UnlockedMigrationController:
    '0x76ae358d9ad91651b78463ae609dadc9e7ce4402' as Address,
  LockedMigrationController:
    '0x22cd7e6a89f5bf4510ef22b3dd4ef190d22f95c3' as Address,
  WrapperRegistryImpl: '0x8266dc167c10a03a5a22aa706a08d8422f40559c' as Address,
  VerifiableFactory: '0x9240c5f31d747d60b3d9aed2f57995094342b1ed' as Address,
  ENSV2Resolver: '0x18cb116a1c88531a4bb2996e4fef136a31e11a80' as Address,
  PreMigrationController:
    '0xee63749b063c08dedee9478504177c27bf9193d7' as Address,
} as const
