import { buttonType } from './buttonType.ts'
import { hoistPureHelpers } from './hoistPureHelpers.ts'
import { iconSizeClasses } from './iconSizeClasses.ts'
import { mustUseResult } from './mustUseResult.ts'
import { noForeignTestid } from './noForeignTestid.ts'
import { noNumberOnBigint } from './noNumberOnBigint.ts'
import { noSharedMutation } from './noSharedMutation.ts'
import { noSilentFallback } from './noSilentFallback.ts'
import { noThrow } from './noThrow.ts'
import { noUncheckedCast } from './noUncheckedCast.ts'

/** agent-lint's own ESLint rules, registered under the `agent` prefix. */
export const agentPlugin = {
  meta: { name: 'agent-lint' },
  rules: {
    'button-type': buttonType,
    'hoist-pure-helpers': hoistPureHelpers,
    'icon-size-classes': iconSizeClasses,
    'must-use-result': mustUseResult,
    'no-foreign-testid': noForeignTestid,
    'no-number-on-bigint': noNumberOnBigint,
    'no-shared-mutation': noSharedMutation,
    'no-silent-fallback': noSilentFallback,
    'no-throw': noThrow,
    'no-unchecked-cast': noUncheckedCast,
  },
}
