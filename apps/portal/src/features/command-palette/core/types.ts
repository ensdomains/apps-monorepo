import type { Address } from 'viem'
import type { ProtocolVersion } from '@/utils/types'

export type PaletteScope = 'normal' | 'developer'

export type PaletteEntity =
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'address'; readonly address: Address }

export type PaletteTargetMetadata = {
  readonly entity: PaletteEntity
  readonly protocolVersion?: ProtocolVersion
  readonly isAvailable?: boolean
}

export type PaletteContext = {
  readonly entity?: PaletteEntity
  readonly walletAddress?: Address
  readonly chainId: number
  readonly developerEnabled: boolean
}

export type NameCommandRoute =
  | '/$name'
  | '/$name/records'
  | '/$name/edit-records'
  | '/$name/create-subname'
  | '/$name/ownership/transfer'
  | '/$name/ownership'
  | '/$name/change-resolver'
  | '/$name/roles'
  | '/$name/fuses'
  | '/$name/fuses/burn'
  | '/$name/address'
  | '/$name/subnames'
  | '/$name/registry'
  | '/$name/resolver'
  | '/$name/token'
  | '/$name/history'

export type AddressCommandRoute =
  | '/addr/$addr'
  | '/addr/$addr/names'
  | '/addr/$addr/resolution'
  | '/addr/$addr/reverse-resolution'
  | '/addr/$addr/history'

export type PaletteOperation =
  | { readonly type: 'navigate-name'; readonly to: NameCommandRoute }
  | { readonly type: 'navigate-address'; readonly to: AddressCommandRoute }
  | { readonly type: 'navigate'; readonly to: '/' }
  | { readonly type: 'register' }
  | { readonly type: 'import' }
  | { readonly type: 'renew' }
  | { readonly type: 'grant-role' }
  | {
      readonly type: 'copy'
      readonly value: 'name' | 'address' | 'namehash' | 'url'
    }
  | { readonly type: 'rpc' }
  | { readonly type: 'connect' }
  | { readonly type: 'disconnect' }
  | { readonly type: 'expiring-names' }
  | {
      readonly type: 'developer'
      readonly tool: 'drawer' | 'time-travel' | 'migration' | 'design-qa'
    }

export type PaletteIcon =
  | 'name'
  | 'edit'
  | 'records'
  | 'renew'
  | 'expiring'
  | 'register'
  | 'import'
  | 'subname'
  | 'subnames'
  | 'transfer'
  | 'ownership'
  | 'resolver'
  | 'change-resolver'
  | 'resolution'
  | 'reverse-resolution'
  | 'registry'
  | 'token'
  | 'history'
  | 'fuses'
  | 'burn'
  | 'roles'
  | 'grant-role'
  | 'copy'
  | 'hash'
  | 'link'
  | 'names'
  | 'wallet'
  | 'primary-name'
  | 'connect'
  | 'disconnect'
  | 'home'
  | 'settings'
  | 'search'
  | 'page'
  | 'developer'
  | 'time-travel'
  | 'migration'
  | 'design-qa'

export type PaletteCommand = {
  readonly id: string
  readonly title: string
  readonly icon: PaletteIcon
  readonly keywords: readonly string[]
  readonly scope: PaletteScope
  readonly group: 'Actions' | 'Navigation' | 'Wallet' | 'Developer'
  readonly target: 'none' | 'name' | 'address' | 'wallet'
  readonly operation: PaletteOperation
  readonly isApplicable?: (target: PaletteTargetMetadata) => boolean
}

export type CommandTargetResolution =
  | { readonly status: 'ready'; readonly entity: PaletteEntity | null }
  | {
      readonly status: 'needs-target'
      readonly target: 'name' | 'address'
    }
  | { readonly status: 'needs-wallet' }

export type PaletteCommandMatch = {
  readonly command: PaletteCommand
  readonly title: string
  readonly entity?: PaletteEntity
  readonly score: number
}
