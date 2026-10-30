import { match } from 'ts-pattern'
import type { ResolverSetupReplacement } from '../components/dialogs/ResolverSetupConfirmDialog'

/** What setting up a resolver for an edited profile replaces. */
export const getResolverReplacement = ({
  isResolverInvalid,
  hasResolver,
}: {
  readonly isResolverInvalid: boolean
  readonly hasResolver: boolean
}): ResolverSetupReplacement =>
  match({ isResolverInvalid, hasResolver })
    .returnType<ResolverSetupReplacement>()
    .with({ isResolverInvalid: true }, () => 'invalid-resolver')
    .with({ hasResolver: true }, () => 'resolver')
    .otherwise(() => 'nothing')
