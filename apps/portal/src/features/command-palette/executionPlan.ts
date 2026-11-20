import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { namehash } from 'viem/ens'
import { isCanonicalName, isValidEnsName } from '@/utils/token/isNormalized'
import type {
  AddressCommandRoute,
  NameCommandRoute,
  PaletteCommand,
  PaletteContext,
  PaletteEntity,
} from './core/types'

export type PaletteNavigation =
  | {
      readonly to: NameCommandRoute
      readonly params: { readonly name: string }
    }
  | {
      readonly to: AddressCommandRoute
      readonly params: { readonly addr: Address }
    }
  | { readonly to: '/' }
  | { readonly to: '/register'; readonly search: { readonly name: string } }
  | { readonly to: '/import/$name'; readonly params: { readonly name: string } }
  | {
      readonly to: '/resolver/$address'
      readonly params: { readonly address: Address }
    }

export type ExecutionPlan =
  | { readonly type: 'navigate'; readonly navigation: PaletteNavigation }
  | {
      readonly type: 'handoff'
      readonly kind: 'renew' | 'grant-role'
      readonly name: string
    }
  | { readonly type: 'expiring-names'; readonly address: Address }
  | { readonly type: 'copy'; readonly value: string; readonly label: string }
  | { readonly type: 'rpc' }
  | { readonly type: 'connect' }
  | { readonly type: 'disconnect' }
  | {
      readonly type: 'developer'
      readonly tool: 'drawer' | 'time-travel' | 'migration' | 'design-qa'
    }

export type PlanResolution =
  | { readonly status: 'ready'; readonly plan: ExecutionPlan }
  | { readonly status: 'needs-connection' }
  | { readonly status: 'blocked'; readonly reason: string }

const MUTATING_NAME_ROUTES: readonly NameCommandRoute[] = [
  '/$name/edit-records',
  '/$name/create-subname',
  '/$name/ownership/transfer',
  '/$name/change-resolver',
  '/$name/fuses/burn',
]

const requiresConnection = (command: PaletteCommand): boolean =>
  match(command.operation)
    .with({ type: 'renew' }, { type: 'grant-role' }, () => true)
    .with({ type: 'navigate-name' }, ({ to }) =>
      MUTATING_NAME_ROUTES.includes(to),
    )
    .otherwise(() => command.target === 'wallet')

const ready = (plan: ExecutionPlan): PlanResolution => ({
  status: 'ready',
  plan,
})
const blocked = (reason: string): PlanResolution => ({
  status: 'blocked',
  reason,
})

export const createExecutionPlan = ({
  command,
  entity,
  context,
  origin,
}: {
  readonly command: PaletteCommand
  readonly entity: PaletteEntity | null
  readonly context: PaletteContext
  readonly origin: string
}): PlanResolution => {
  const isWriteEntry = requiresConnection(command)
  if (
    entity?.type === 'name' &&
    isWriteEntry &&
    !isCanonicalName(entity.name)
  ) {
    return blocked(
      'This spelling cannot safely enter a name-management workflow. View the name to inspect its canonical-name warning.',
    )
  }
  if (isWriteEntry && !context.walletAddress)
    return { status: 'needs-connection' }

  return match(command.operation)
    .with({ type: 'navigate' }, ({ to }) =>
      ready({ type: 'navigate', navigation: { to } }),
    )
    .with({ type: 'navigate-name' }, ({ to }) =>
      entity?.type === 'name'
        ? ready({
            type: 'navigate',
            navigation: { to, params: { name: entity.name } },
          })
        : blocked('Choose a name to continue.'),
    )
    .with({ type: 'navigate-address' }, ({ to }) =>
      entity?.type === 'address'
        ? ready({
            type: 'navigate',
            navigation: { to, params: { addr: entity.address } },
          })
        : blocked('Choose an address to continue.'),
    )
    .with({ type: 'register' }, () =>
      entity?.type === 'name'
        ? ready({
            type: 'navigate',
            navigation: { to: '/register', search: { name: entity.name } },
          })
        : blocked('Choose a name to register.'),
    )
    .with({ type: 'import' }, () =>
      entity?.type === 'name'
        ? ready({
            type: 'navigate',
            navigation: { to: '/import/$name', params: { name: entity.name } },
          })
        : blocked('Choose a DNS name to import.'),
    )
    .with({ type: 'renew' }, { type: 'grant-role' }, ({ type }) =>
      entity?.type === 'name'
        ? ready({ type: 'handoff', kind: type, name: entity.name })
        : blocked('Choose a name to continue.'),
    )
    .with({ type: 'expiring-names' }, () =>
      entity?.type === 'address'
        ? ready({ type: 'expiring-names', address: entity.address })
        : blocked('Connect a wallet to see its expiring names.'),
    )
    .with({ type: 'copy' }, ({ value }) =>
      createCopyPlan(value, entity, origin),
    )
    .with({ type: 'rpc' }, () => ready({ type: 'rpc' }))
    .with({ type: 'connect' }, () => ready({ type: 'connect' }))
    .with({ type: 'disconnect' }, () => ready({ type: 'disconnect' }))
    .with({ type: 'developer' }, ({ tool }) =>
      context.developerEnabled
        ? ready({ type: 'developer', tool })
        : blocked('Developer tools are not enabled in this environment.'),
    )
    .exhaustive()
}

const createCopyPlan = (
  value: 'name' | 'address' | 'namehash' | 'url',
  entity: PaletteEntity | null,
  origin: string,
): PlanResolution => {
  if (!entity) return blocked('Choose what you want to copy.')
  if (value === 'url') {
    const path =
      entity.type === 'name'
        ? `/${encodeURIComponent(entity.name)}`
        : `/addr/${entity.address}`
    return ready({
      type: 'copy',
      value: `${origin}${path}`,
      label: 'Portal link',
    })
  }
  if (value === 'address' && entity.type === 'address') {
    return ready({ type: 'copy', value: entity.address, label: 'Address' })
  }
  if (value === 'name' && entity.type === 'name') {
    return ready({ type: 'copy', value: entity.name, label: 'Name' })
  }
  if (
    value === 'namehash' &&
    entity.type === 'name' &&
    isValidEnsName(entity.name)
  ) {
    return ready({
      type: 'copy',
      value: namehash(entity.name),
      label: 'Namehash',
    })
  }
  return blocked('This value is not available for the selected entity.')
}
