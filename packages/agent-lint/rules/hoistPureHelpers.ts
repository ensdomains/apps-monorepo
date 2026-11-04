import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { createRule } from './create.ts'

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration

const isFunction = (node: TSESTree.Node): node is FunctionNode =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration'

/** The name a function is known by: its own, or the variable it initialises. */
const nameOf = (fn: FunctionNode): string | undefined => {
  if (fn.type === 'FunctionDeclaration') return fn.id?.name
  const parent = fn.parent
  return parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier'
    ? parent.id.name
    : undefined
}

const enclosingFunction = (node: TSESTree.Node): FunctionNode | undefined => {
  const parent = node.parent
  // The program node's parent is null.
  if (parent === undefined || parent === null) return undefined
  return isFunction(parent) ? parent : enclosingFunction(parent)
}

/** 'this component' or 'this hook' for a top-level component or hook. */
const ownerKind = (fn: FunctionNode): string | undefined => {
  if (enclosingFunction(fn) !== undefined) return undefined
  const name = nameOf(fn) ?? ''
  if (/^use[A-Z]/u.test(name)) return 'this hook'
  if (/^[A-Z]/u.test(name)) return 'this component'
  return undefined
}

/** Only declared helpers: an inline callback belongs where it is used. */
const isDeclaredHelper = (fn: FunctionNode): boolean =>
  (fn.type === 'FunctionDeclaration' ||
    fn.parent?.type === 'VariableDeclarator') &&
  !/^[A-Z]/u.test(nameOf(fn) ?? '')

/** `let f = () => {}` reassigned later is a placeholder, not a helper. */
const isReassignedLet = (
  fn: FunctionNode,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean => {
  const declarator = fn.parent
  if (
    declarator?.type !== 'VariableDeclarator' ||
    declarator.parent.type !== 'VariableDeclaration' ||
    declarator.parent.kind !== 'let'
  ) {
    return false
  }
  return sourceCode
    .getDeclaredVariables(declarator)
    .some((variable) =>
      variable.references.some((ref) => ref.isWrite() && !ref.init),
    )
}

/** True when the function reads anything declared outside module scope. */
const hasOuterReference = (
  fn: FunctionNode,
  sourceCode: Readonly<TSESLint.SourceCode>,
): boolean => {
  const scope = sourceCode.scopeManager?.acquire(fn)
  if (scope === null || scope === undefined) return true
  return scope.through.some((reference) => {
    const home = reference.resolved?.scope.type
    return home !== undefined && home !== 'module' && home !== 'global'
  })
}

/**
 * react.md "Hoist static values and pure functions out of the body" (Default),
 * STYLEGUIDE.md "Extract Static Values and Pure Functions": a helper declared
 * inside a component or hook that uses nothing from it (no props, state, hooks
 * or other locals) belongs at module scope. Unlike unicorn's
 * consistent-function-scoping, a helper that closes over the component's
 * locals stays, inline callbacks are left alone, and only components and
 * hooks are checked.
 */
export const hoistPureHelpers = createRule({
  name: 'hoist-pure-helpers',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Move helpers that use nothing from their component to module scope',
    },
    messages: {
      hoist:
        'This function uses nothing from {{owner}}; move it to module scope so it is not rebuilt on every render.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const check = (fn: FunctionNode): void => {
      const owner = enclosingFunction(fn)
      const kind = owner === undefined ? undefined : ownerKind(owner)
      if (
        kind === undefined ||
        !isDeclaredHelper(fn) ||
        isReassignedLet(fn, context.sourceCode) ||
        hasOuterReference(fn, context.sourceCode)
      ) {
        return
      }
      context.report({ node: fn, messageId: 'hoist', data: { owner: kind } })
    }
    return {
      ArrowFunctionExpression: check,
      FunctionExpression: check,
      FunctionDeclaration: check,
    }
  },
})
