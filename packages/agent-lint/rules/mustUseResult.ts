import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import type ts from 'typescript'
import { createRule } from './create.ts'

const RESULT_CLASSES: ReadonlySet<string> = new Set([
  'Ok',
  'Err',
  'ResultAsync',
])

const fromNeverthrow = (symbol: ts.Symbol): boolean =>
  (symbol.getDeclarations() ?? []).some((d) =>
    d.getSourceFile().fileName.includes('/neverthrow/'),
  )

/** True when the type is, or may be, a neverthrow Ok, Err or ResultAsync. */
export const isResultType = (type: ts.Type): boolean => {
  if (type.isUnion()) return type.types.some(isResultType)
  const symbol = type.getSymbol()
  return (
    symbol !== undefined &&
    RESULT_CLASSES.has(symbol.getName()) &&
    fromNeverthrow(symbol)
  )
}

const unwrapVoid = (node: TSESTree.Expression): TSESTree.Expression =>
  node.type === 'UnaryExpression' && node.operator === 'void'
    ? node.argument
    : node

/**
 * neverthrow.md "Never silently discard a failure" (Must), core.md "Never
 * discard a failure Result" (Must): a statement whose value is a Result or
 * ResultAsync throws the failure away. `void` makes the discard explicit but
 * still discards it.
 */
export const mustUseResult = createRule({
  name: 'must-use-result',
  meta: {
    type: 'problem',
    docs: { description: 'Never discard a neverthrow Result or ResultAsync' },
    messages: {
      discarded:
        'This Result is thrown away, and with it any failure. Handle it (match, isErr, yield* in a ResultFn generator) or return it.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()
    return {
      ExpressionStatement(statement) {
        const expression = unwrapVoid(statement.expression)
        // `yield* new SomeError(...)` is the guard that ends a ResultFn generator.
        if (
          expression.type === 'AssignmentExpression' ||
          expression.type === 'YieldExpression'
        ) {
          return
        }
        const type = checker.getTypeAtLocation(
          services.esTreeNodeToTSNodeMap.get(expression),
        )
        if (isResultType(type)) {
          context.report({ node: expression, messageId: 'discarded' })
        }
      },
    }
  },
})
