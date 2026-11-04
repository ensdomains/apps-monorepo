import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { createRule } from './create.ts'

/** The shortest comment that can say why an error is dropped. */
const REASON_LENGTH = 15

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration

const isFunction = (node: TSESTree.Node): node is FunctionNode =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration'

/** Nothing, undefined, null, a boolean, a number, '', [] or {}. */
const isEmptyValue = (node: TSESTree.Node | null | undefined): boolean => {
  if (node === null || node === undefined) return true
  if (node.type === 'Identifier') return node.name === 'undefined'
  if (node.type === 'Literal') {
    return (
      node.value === null ||
      typeof node.value === 'boolean' ||
      typeof node.value === 'number' ||
      typeof node.value === 'bigint' ||
      node.value === ''
    )
  }
  if (node.type === 'ArrayExpression') return node.elements.length === 0
  if (node.type === 'ObjectExpression') return node.properties.length === 0
  return false
}

/** A catch's only statement gives up quietly: returns, skips or sets an empty value. */
const givesUpQuietly = (statement: TSESTree.Statement): boolean => {
  if (statement.type === 'ReturnStatement') {
    return isEmptyValue(statement.argument)
  }
  if (statement.type === 'ContinueStatement') return true
  return (
    statement.type === 'ExpressionStatement' &&
    statement.expression.type === 'AssignmentExpression' &&
    statement.expression.operator === '=' &&
    isEmptyValue(statement.expression.right)
  )
}

/** What a `.catch` handler resolves with, or undefined when it does more than return. */
const resolvedValue = (
  handler: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): { readonly value: TSESTree.Node | null } | undefined => {
  if (handler.body.type !== 'BlockStatement') return { value: handler.body }
  const statements = handler.body.body
  if (statements.length === 0) return { value: null }
  const [only] = statements
  return statements.length === 1 && only?.type === 'ReturnStatement'
    ? { value: only.argument }
    : undefined
}

const isStatementPosition = (node: TSESTree.Node): boolean => {
  const parent = node.parent
  if (parent?.type === 'ExpressionStatement') return true
  const isWrapped =
    parent?.type === 'AwaitExpression' ||
    (parent?.type === 'UnaryExpression' && parent.operator === 'void')
  return isWrapped && parent.parent?.type === 'ExpressionStatement'
}

const isBlockLevel = (node: TSESTree.Node): boolean => {
  const parent = node.parent
  return (
    parent === undefined ||
    parent.type === 'BlockStatement' ||
    parent.type === 'Program' ||
    parent.type === 'SwitchCase' ||
    parent.type === 'StaticBlock'
  )
}

/** `node` and its ancestors up to the statement that holds it, and an export around that. */
const upToStatement = (node: TSESTree.Node): ReadonlyArray<TSESTree.Node> => {
  const parent = node.parent
  if (isBlockLevel(node) || parent === undefined) return [node]
  if (
    parent.type === 'ExportNamedDeclaration' ||
    parent.type === 'ExportDefaultDeclaration'
  ) {
    return [node, parent]
  }
  return [node, ...upToStatement(parent)]
}

const nearestFunction = (
  node: TSESTree.Node | undefined,
): FunctionNode | undefined => {
  if (node === undefined) return undefined
  return isFunction(node) ? node : nearestFunction(node.parent)
}

/** The nodes a doc comment of the function would sit in front of. */
const headOf = (fn: FunctionNode): ReadonlyArray<TSESTree.Node> => {
  const parent = fn.parent
  if (parent?.type === 'VariableDeclarator') {
    return upToStatement(parent)
  }
  if (parent?.type === 'Property' || parent?.type === 'MethodDefinition') {
    return [parent]
  }
  return upToStatement(fn)
}

/** True when the error is explained inside `inner`, above `start`, or on the function holding it. */
const isExplained = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  inner: TSESTree.Node,
  start: TSESTree.Node,
): boolean => {
  const hasReason = (comments: ReadonlyArray<TSESTree.Comment>): boolean =>
    comments.some((comment) => comment.value.trim().length >= REASON_LENGTH)
  const fn = nearestFunction(start.parent)
  const before = [
    ...upToStatement(start),
    ...(fn === undefined ? [] : headOf(fn)),
  ]
  return (
    hasReason(sourceCode.getCommentsInside(inner)) ||
    before.some((node) => hasReason(sourceCode.getCommentsBefore(node)))
  )
}

const usesItsError = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  node:
    | TSESTree.CatchClause
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionExpression,
): boolean =>
  sourceCode
    .getDeclaredVariables(node)
    .some((variable) => variable.references.length > 0)

/**
 * core.md "Errors as values" (Must): a failure is handled, propagated or
 * reported, never silently replaced. Reports a catch whose one statement
 * returns nothing or an empty value, skips a loop turn or sets an empty value
 * without using its error, and a promise `.catch` that resolves with an empty
 * value while its result is used. A comment of 15 characters or more says why
 * dropping the error is right (a probe, cleanup that must not throw): inside
 * the catch, above the statement or expression that holds it, or in the doc
 * of the function around it. A discarded `.catch(() => undefined)` and an
 * empty catch are no-empty-catch's.
 */
export const noSilentFallback = createRule({
  name: 'no-silent-fallback',
  meta: {
    type: 'problem',
    docs: {
      description:
        'A catch that drops its error and carries on with an empty value says why',
    },
    messages: {
      silent:
        'This catch drops the error and carries on with an empty value. Propagate it, return it as a value or log it; if dropping it is right (a probe, cleanup that must not throw), say why in a comment of 15 characters or more inside it, above it, or in the doc of its function.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CatchClause(node) {
        const [only, ...rest] = node.body.body
        if (only === undefined || rest.length > 0 || !givesUpQuietly(only)) {
          return
        }
        if (usesItsError(sourceCode, node)) return
        if (isExplained(sourceCode, node.body, node.parent)) return
        context.report({ node, messageId: 'silent' })
      },
      CallExpression(node) {
        const callee = node.callee
        const [handler, ...others] = node.arguments
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'catch' ||
          handler === undefined ||
          others.length > 0 ||
          (handler.type !== 'ArrowFunctionExpression' &&
            handler.type !== 'FunctionExpression')
        ) {
          return
        }
        const resolved = resolvedValue(handler)
        if (resolved === undefined || !isEmptyValue(resolved.value)) return
        if (isStatementPosition(node)) return
        if (usesItsError(sourceCode, handler)) return
        if (isExplained(sourceCode, handler, node)) return
        context.report({ node: handler, messageId: 'silent' })
      },
    }
  },
})
