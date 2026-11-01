import {
  ASTUtils,
  ESLintUtils,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils'
import { createRule } from './create.ts'

const MUTATING_METHODS: ReadonlySet<string> = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

/** Accessors made to be written: React refs and component display names. */
const WRITABLE_PROPERTIES: ReadonlySet<string> = new Set([
  'current',
  'displayName',
])

type Root = TSESTree.Identifier | TSESTree.ThisExpression

/** The variable or `this` at the bottom of `a.b[c].d`, or nothing for a fresh value. */
const rootOf = (node: TSESTree.Node): Root | undefined => {
  if (node.type === 'Identifier' || node.type === 'ThisExpression') return node
  if (node.type === 'MemberExpression') return rootOf(node.object)
  if (
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'ChainExpression'
  ) {
    return rootOf(node.expression)
  }
  return undefined
}

const propertyName = (node: TSESTree.MemberExpression): string | undefined =>
  node.property.type === 'Identifier' && !node.computed
    ? node.property.name
    : undefined

const enclosingFunction = (
  node: TSESTree.Node,
): TSESTree.FunctionLike | undefined => {
  const parent = node.parent
  // The program node's parent is null.
  if (parent === undefined || parent === null) return undefined
  return parent.type === 'ArrowFunctionExpression' ||
    parent.type === 'FunctionExpression' ||
    parent.type === 'FunctionDeclaration'
    ? parent
    : enclosingFunction(parent)
}

const inConstructor = (node: TSESTree.Node): boolean => {
  const fn = enclosingFunction(node)
  return (
    fn?.parent?.type === 'MethodDefinition' && fn.parent.kind === 'constructor'
  )
}

/** Who owns a variable a function mutates, or nothing when the function does. */
const describeOwner = (
  variable: TSESLint.Scope.Variable,
  name: string,
  here: TSESLint.Scope.Scope,
): string | undefined => {
  const definition = variable.defs[0]
  if (definition === undefined) return undefined
  if (definition.type === 'Parameter') return `the parameter \`${name}\``
  if (definition.type === 'ImportBinding') return `the import \`${name}\``
  const home = variable.scope.variableScope
  if (home === here) return undefined
  return home.type === 'module' || home.type === 'global'
    ? `the module-level \`${name}\``
    : `\`${name}\`, captured from an outer function`
}

/** The value a call mutates: the receiver of push and its kin, or Object.assign's target. */
const mutatedBy = (
  call: TSESTree.CallExpression,
): TSESTree.Node | undefined => {
  const callee = call.callee
  if (callee.type !== 'MemberExpression') return undefined
  const method = propertyName(callee)
  if (method !== undefined && MUTATING_METHODS.has(method)) return callee.object
  const [target] = call.arguments
  const isObjectAssign =
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Object' &&
    method === 'assign'
  return isObjectAssign &&
    target !== undefined &&
    target.type !== 'SpreadElement'
    ? target
    : undefined
}

/**
 * core.md "Minimal mutation" (Default), the TypeScript README "Immutability
 * constructs" (no in-place mutation, Must), Greptile no-mutation: never mutate
 * shared state. A function may build a value and fill it in; it may not
 * mutate what it does not own: a parameter, an import, a module-level value,
 * a variable it captured from an outer function, or `this` outside a
 * constructor. Platform objects (DOM elements, the canvas, browser globals),
 * React refs and display names have no immutable form and are left alone.
 */
export const noSharedMutation = createRule({
  name: 'no-shared-mutation',
  meta: {
    type: 'problem',
    docs: { description: 'Do not mutate state this function does not own' },
    messages: {
      shared:
        'Do not mutate {{owner}}: it is shared state this function does not own. Build a new value and return it instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()

    const isPlatformObject = (root: TSESTree.Identifier): boolean => {
      const type = checker.getTypeAtLocation(
        services.esTreeNodeToTSNodeMap.get(root),
      )
      const symbol = type.getSymbol() ?? type.aliasSymbol
      return (symbol?.getDeclarations() ?? []).some((d) =>
        /[/\\]typescript[/\\]lib[/\\]lib\.(?:dom|webworker)[^/\\]*\.d\.ts$/u.test(
          d.getSourceFile().fileName,
        ),
      )
    }

    const ownerOf = (root: Root, at: TSESTree.Node): string | undefined => {
      if (root.type === 'ThisExpression') {
        return inConstructor(at) ? undefined : '`this`'
      }
      const scope = context.sourceCode.getScope(at)
      const variable = ASTUtils.findVariable(scope, root.name)
      // An unresolved name is a browser or runtime global: the imperative shell.
      if (variable === null || isPlatformObject(root)) return undefined
      return describeOwner(variable, root.name, scope.variableScope)
    }

    const check = (target: TSESTree.Node, report: TSESTree.Node): void => {
      if (
        target.type === 'MemberExpression' &&
        WRITABLE_PROPERTIES.has(propertyName(target) ?? '')
      ) {
        return
      }
      const root = rootOf(target)
      if (root === undefined) return
      const owner = ownerOf(root, report)
      if (owner !== undefined) {
        context.report({ node: report, messageId: 'shared', data: { owner } })
      }
    }

    const listener: TSESLint.RuleListener = {
      AssignmentExpression(node) {
        if (node.left.type === 'MemberExpression') check(node.left, node)
      },
      UpdateExpression(node) {
        if (node.argument.type === 'MemberExpression')
          check(node.argument, node)
      },
      UnaryExpression(node) {
        if (
          node.operator === 'delete' &&
          node.argument.type === 'MemberExpression'
        ) {
          check(node.argument, node)
        }
      },
      CallExpression(node) {
        const target = mutatedBy(node)
        if (target !== undefined) check(target, node)
      },
    }
    return listener
  },
})
