import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import ts from 'typescript'
import { createRule } from './create.ts'

const mayBeBigint = (type: ts.Type): boolean =>
  type.isUnion()
    ? type.types.some(mayBeBigint)
    : (type.getFlags() & ts.TypeFlags.BigIntLike) !== 0

/** Values that are times or small counts, never token amounts. */
const TIME_OR_COUNT =
  /(?:timestamp|expiry|expires|seconds|duration|period|deadline|validUntil|elapsed|age|block|blockNumber|nonce|chainId|fuses?|overhead)$/iu

/** The last name in `a.b.c`, `a.b()` or `a!`: the thing the value is called. */
const lastName = (node: TSESTree.Node): string | undefined => {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') {
    return node.property.type === 'Identifier' ? node.property.name : undefined
  }
  if (node.type === 'CallExpression') return lastName(node.callee)
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression') {
    return lastName(node.expression)
  }
  return undefined
}

const isThousand = (node: TSESTree.Node): boolean =>
  node.type === 'Literal' && node.value === 1000

/**
 * Conversions that are not chain arithmetic: a timestamp handed to Date or
 * scaled to milliseconds, the sign of a bigint difference (comparators), or
 * a value named as a time or a count.
 */
const isSafeConversion = (
  call: TSESTree.CallExpression,
  argument: TSESTree.Node,
): boolean => {
  const parent = call.parent
  if (
    parent?.type === 'NewExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Date'
  ) {
    return true
  }
  if (
    parent?.type === 'BinaryExpression' &&
    (parent.operator === '*' || parent.operator === '/') &&
    (isThousand(parent.left) || isThousand(parent.right))
  ) {
    return true
  }
  if (argument.type === 'BinaryExpression' && argument.operator === '-') {
    return true
  }
  return TIME_OR_COUNT.test(lastName(argument) ?? '')
}

/**
 * web3.md "On-chain quantities are bigint, never number" (Must): `Number()` on
 * a bigint amount loses precision above 2^53 and moves chain arithmetic into
 * floats. Times, counts and the sign of a difference convert safely.
 */
export const noNumberOnBigint = createRule({
  name: 'no-number-on-bigint',
  meta: {
    type: 'problem',
    docs: { description: 'Do not convert a bigint amount with Number()' },
    messages: {
      converted:
        'Keep chain quantities as bigint: Number() loses precision above 2^53. Do the arithmetic in bigint and format for display with formatUnits or formatEther.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()
    return {
      CallExpression(call) {
        const [argument] = call.arguments
        if (
          call.callee.type !== 'Identifier' ||
          call.callee.name !== 'Number' ||
          argument === undefined ||
          argument.type === 'SpreadElement' ||
          isSafeConversion(call, argument)
        ) {
          return
        }
        const type = checker.getTypeAtLocation(
          services.esTreeNodeToTSNodeMap.get(argument),
        )
        if (mayBeBigint(type)) {
          context.report({ node: call, messageId: 'converted' })
        }
      },
    }
  },
})
