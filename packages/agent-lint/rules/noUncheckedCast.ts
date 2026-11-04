import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import ts from 'typescript'
import { createRule } from './create.ts'

/** Helpers whose second argument maps an unknown failure to a typed error. */
const ERROR_MAPPERS: ReadonlySet<string> = new Set([
  'fromPromise',
  'fromThrowable',
  'fromSync',
  'fromAsyncThrowable',
  'fromSafePromise',
])

const calleeName = (call: TSESTree.CallExpression): string | undefined => {
  const callee = call.callee
  if (callee.type === 'Identifier') return callee.name
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name
  }
  return undefined
}

/** True inside the error-mapping argument of fromPromise and its kin. */
const inErrorMapper = (node: TSESTree.Node): boolean => {
  const parent = node.parent
  // The program node's parent is null.
  if (parent === undefined || parent === null) return false
  if (
    parent.type === 'CallExpression' &&
    ERROR_MAPPERS.has(calleeName(parent) ?? '') &&
    parent.arguments.slice(1).some((argument) => argument === node)
  ) {
    return true
  }
  return inErrorMapper(parent)
}

/** XState's `types: { context: {} as T }` declares a type; it asserts nothing. */
const isTypePlaceholder = (
  node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
): boolean =>
  node.expression.type === 'ObjectExpression' &&
  node.expression.properties.length === 0 &&
  node.parent?.type === 'Property' &&
  node.parent.parent?.type === 'ObjectExpression' &&
  node.parent.parent.parent?.type === 'Property' &&
  node.parent.parent.parent.key.type === 'Identifier' &&
  node.parent.parent.parent.key.name === 'types'

/** React's style prop: an object of CSS custom properties has no cast-free type. */
const isCssVariableStyle = (
  node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
): boolean =>
  node.expression.type === 'ObjectExpression' &&
  node.expression.properties.some(
    (property) =>
      property.type === 'Property' &&
      property.key.type === 'Literal' &&
      typeof property.key.value === 'string' &&
      property.key.value.startsWith('--'),
  )

const isConstAssertion = (
  node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
): boolean =>
  node.typeAnnotation.type === 'TSTypeReference' &&
  node.typeAnnotation.typeName.type === 'Identifier' &&
  node.typeAnnotation.typeName.name === 'const'

/**
 * core.md "Type-safety first" (no unchecked casts around a type error, Must):
 * a cast that narrows a value to a type it is not known to have. Widening
 * casts, `as const`, the error mapper of fromPromise and its kin, XState's
 * type placeholders, React style objects of CSS custom properties, and casts
 * of values the checker could not type are left alone.
 */
export const noUncheckedCast = createRule({
  name: 'no-unchecked-cast',
  meta: {
    type: 'problem',
    docs: { description: 'No cast that narrows a type without a check' },
    messages: {
      narrowing:
        'This cast narrows `{{from}}` to `{{to}}` without a check. Validate the value with a type guard or a schema, then let the guard narrow it.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()
    const check = (
      node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion,
    ): void => {
      if (
        isConstAssertion(node) ||
        isTypePlaceholder(node) ||
        isCssVariableStyle(node) ||
        inErrorMapper(node)
      )
        return
      const from = checker.getTypeAtLocation(
        services.esTreeNodeToTSNodeMap.get(node.expression),
      )
      const to = checker.getTypeAtLocation(
        services.esTreeNodeToTSNodeMap.get(node),
      )
      const untyped = ts.TypeFlags.Any | ts.TypeFlags.Unknown
      if ((from.getFlags() & ts.TypeFlags.Any) !== 0) return
      if ((to.getFlags() & untyped) !== 0) return
      if (checker.isTypeAssignableTo(from, to)) return
      context.report({
        node,
        messageId: 'narrowing',
        data: {
          from: checker.typeToString(from),
          to: checker.typeToString(to),
        },
      })
    }
    return { TSAsExpression: check, TSTypeAssertion: check }
  },
})
