import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils'
import ts from 'typescript'
import { createRule } from './create.ts'

const mayBeBigint = (type: ts.Type): boolean =>
  type.isUnion()
    ? type.types.some(mayBeBigint)
    : (type.getFlags() & ts.TypeFlags.BigIntLike) !== 0

/** Values that are times, ids, codes or small counts, never token amounts. */
const TIME_OR_COUNT =
  /(?:timestamp|expiry|expires|seconds|duration|period|deadline|validUntil|elapsed|age|block|blockNumber|nonce|chainId|fuses?|overhead|status)$/iu

/**
 * camelCase names that end in a time word (expiryDate, graceEndsAt, formatUtc)
 * and a signature's `v`. Case matters here: `update` is not a date.
 */
const TIME_WORD = /(?:[a-z0-9](?:Date|At|Utc)|^(?:date|v))$/u

const isNotAnAmount = (name: string | undefined): boolean =>
  name !== undefined && (TIME_OR_COUNT.test(name) || TIME_WORD.test(name))

/** The last name in `a.b.c`, `a?.b`, `a ?? b`, `a.b()` or `a!`: the thing the value is called. */
const lastName = (node: TSESTree.Node): string | undefined => {
  switch (node.type) {
    case 'Identifier':
      return node.name
    case 'MemberExpression':
      return node.property.type === 'Identifier'
        ? node.property.name
        : undefined
    case 'CallExpression':
      return lastName(node.callee)
    case 'LogicalExpression':
      return lastName(node.left)
    case 'ChainExpression':
    case 'TSNonNullExpression':
    case 'TSAsExpression':
      return lastName(node.expression)
    default:
      return undefined
  }
}

/** The function a `return` leaves, by name: its own, or the variable it is assigned to. */
const returnedFrom = (node: TSESTree.Node): string | undefined => {
  const parent = node.parent
  if (parent === undefined) return undefined
  switch (parent.type) {
    case 'FunctionDeclaration':
      return parent.id?.name
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return parent.parent?.type === 'VariableDeclarator'
        ? lastName(parent.parent.id)
        : undefined
    default:
      return returnedFrom(parent)
  }
}

/**
 * What the number is kept as: the variable or property it is assigned to
 * (through `?:`), the function that returns it, or the function it is handed to.
 */
const receiverName = (node: TSESTree.Node): string | undefined => {
  const parent = node.parent
  if (parent === undefined) return undefined
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.init === node ? lastName(parent.id) : undefined
    case 'Property':
      return parent.value === node && !parent.computed
        ? lastName(parent.key)
        : undefined
    case 'ConditionalExpression':
      return parent.test === node ? undefined : receiverName(parent)
    case 'CallExpression':
      return parent.arguments.some((argument) => argument === node)
        ? lastName(parent.callee)
        : undefined
    case 'ReturnStatement':
      return returnedFrom(parent)
    default:
      return undefined
  }
}

const isThousand = (node: TSESTree.Node): boolean =>
  node.type === 'Literal' && node.value === 1000

/** `10 ** n` or `10n ** n`: the scale between raw units and the unit a person reads. */
const isPowerOfTen = (node: TSESTree.Node): boolean =>
  node.type === 'BinaryExpression' &&
  node.operator === '**' &&
  node.left.type === 'Literal' &&
  (node.left.raw === '10' || node.left.raw === '10n')

/** A timestamp handed to Date or scaled to milliseconds. */
const isTimestampUse = (call: TSESTree.CallExpression): boolean => {
  const parent = call.parent
  if (parent?.type === 'NewExpression') {
    return parent.callee.type === 'Identifier' && parent.callee.name === 'Date'
  }
  return (
    parent?.type === 'BinaryExpression' &&
    (parent.operator === '*' || parent.operator === '/') &&
    (isThousand(parent.left) || isThousand(parent.right))
  )
}

/** An amount scaled into the unit a person reads: `Number(raw) / 10 ** d` or `Number(raw / 10n ** d)`. */
const isScaledForDisplay = (
  call: TSESTree.CallExpression,
  argument: TSESTree.Node,
): boolean => {
  const parent = call.parent
  const isScaledAfter =
    parent?.type === 'BinaryExpression' &&
    parent.operator === '/' &&
    parent.left === call &&
    isPowerOfTen(parent.right)
  const isScaledBefore =
    argument.type === 'BinaryExpression' &&
    argument.operator === '/' &&
    isPowerOfTen(argument.right)
  return isScaledAfter || isScaledBefore
}

/**
 * Conversions that are not chain arithmetic: a timestamp handed to Date or
 * scaled to milliseconds, the sign of a bigint difference (comparators), an
 * amount scaled by `10 ** decimals` into the unit a person reads, or a value
 * named as a time, id, code or count.
 */
const isSafeConversion = (
  call: TSESTree.CallExpression,
  argument: TSESTree.Node,
): boolean =>
  isTimestampUse(call) ||
  isScaledForDisplay(call, argument) ||
  (argument.type === 'BinaryExpression' && argument.operator === '-') ||
  isNotAnAmount(lastName(argument)) ||
  isNotAnAmount(receiverName(call))

/**
 * web3.md "On-chain quantities are bigint, never number" (Must): `Number()` on
 * a bigint amount loses precision above 2^53 and moves chain arithmetic into
 * floats. Times, ids, codes and counts convert safely, and so does an amount
 * scaled by `10 ** decimals` into the unit a person reads (STYLEGUIDE.md
 * "BigInt Handling": a value derived only for display may be a number). The
 * rule cannot see what happens to the number afterwards: it reads names and
 * the shape of the expression.
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
