import {
  ASTUtils,
  ESLintUtils,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils'
import ts from 'typescript'
import { createRule } from './create.ts'

type FunctionNode =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionExpression
  | TSESTree.FunctionDeclaration

const isFunction = (node: TSESTree.Node): node is FunctionNode =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration'

/**
 * Option keys whose function fails by throwing: TanStack Query's and
 * Router's, and a Cloudflare Worker's scheduled and queue handlers (a thrown
 * run is marked failed, a thrown batch is retried).
 */
const THROWING_KEYS: ReadonlySet<string> = new Set([
  'queryFn',
  'mutationFn',
  'loader',
  'beforeLoad',
  'scheduled',
  'queue',
])

/** XState actor creators whose function fails the actor by throwing. */
const XSTATE_ACTORS: ReadonlySet<string> = new Set([
  'fromPromise',
  'fromCallback',
])

/** TanStack Start builders whose chained callbacks fail the request by throwing. */
const SERVER_BUILDERS: ReadonlySet<string> = new Set([
  'createServerFn',
  'createMiddleware',
])

/** TanStack Router's control flow, thrown but not an error. */
const ROUTER_THROWS: ReadonlySet<string> = new Set(['redirect', 'notFound'])

type Imported = { readonly source: string; readonly name: string }

const importedName = (
  specifier:
    | TSESTree.ImportClause
    | TSESTree.TSImportEqualsDeclaration
    | TSESTree.ImportSpecifier,
): string => {
  if (specifier.type !== 'ImportSpecifier') return 'default'
  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value
}

/** Where `identifier` was imported from, and under which name. */
const importOf = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  identifier: TSESTree.Identifier,
): Imported | undefined => {
  const variable = ASTUtils.findVariable(
    sourceCode.getScope(identifier),
    identifier.name,
  )
  const definition = variable?.defs[0]
  if (
    definition?.type !== 'ImportBinding' ||
    definition.parent.type !== 'ImportDeclaration'
  ) {
    return undefined
  }
  return {
    source: definition.parent.source.value,
    name: importedName(definition.node),
  }
}

const isTanstackImport = (
  imported: Imported | undefined,
  names: ReadonlySet<string>,
): boolean =>
  imported?.source.startsWith('@tanstack/') === true && names.has(imported.name)

/** The first callee of a builder chain such as `createServerFn().handler(fn)`. */
const chainRoot = (node: TSESTree.Node): TSESTree.Node => {
  if (node.type === 'CallExpression') return chainRoot(node.callee)
  if (node.type === 'MemberExpression') return chainRoot(node.object)
  return node
}

/** `node` sits where a library calls a function and expects it to throw on failure. */
const isCallbackPosition = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.Node,
): boolean => {
  const parent = node.parent
  if (parent?.type === 'Property' && parent.value === node) {
    return (
      !parent.computed &&
      parent.key.type === 'Identifier' &&
      THROWING_KEYS.has(parent.key.name)
    )
  }
  if (
    parent?.type !== 'CallExpression' ||
    !parent.arguments.some((argument) => argument === node)
  ) {
    return false
  }
  if (parent.callee.type === 'Identifier') {
    const imported = importOf(sourceCode, parent.callee)
    return imported?.source === 'xstate' && XSTATE_ACTORS.has(imported.name)
  }
  const root = chainRoot(parent.callee)
  return (
    root.type === 'Identifier' &&
    isTanstackImport(importOf(sourceCode, root), SERVER_BUILDERS)
  )
}

/** The declaration that names `fn`, when it has a name in this file. */
const namingNode = (fn: FunctionNode): TSESTree.Node | undefined => {
  if (fn.type === 'FunctionDeclaration') return fn
  const parent = fn.parent
  return parent?.type === 'VariableDeclarator' && parent.init === fn
    ? parent
    : undefined
}

/** A function a library calls and expects to throw: written in place, or passed by its name. */
const isLibraryCallback = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  fn: FunctionNode,
): boolean => {
  if (isCallbackPosition(sourceCode, fn)) return true
  const named = namingNode(fn)
  if (named === undefined) return false
  return sourceCode
    .getDeclaredVariables(named)
    .filter((variable) =>
      variable.defs.some(
        (definition) =>
          definition.type === 'FunctionName' || definition.type === 'Variable',
      ),
    )
    .some((variable) =>
      variable.references.some((reference) =>
        isCallbackPosition(sourceCode, reference.identifier),
      ),
    )
}

/** The root Program's parent is null. */
const isAbsent = (
  node: TSESTree.Node | null | undefined,
): node is null | undefined => node === null || node === undefined

const isInsideLibraryCallback = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.Node | null | undefined,
): boolean => {
  if (isAbsent(node)) return false
  if (isFunction(node) && isLibraryCallback(sourceCode, node)) return true
  return isInsideLibraryCallback(sourceCode, node.parent)
}

const isHonoImport = (imported: Imported | undefined): boolean =>
  (imported?.source === 'hono' ||
    imported?.source.startsWith('hono/') === true) &&
  imported.name === 'HTTPException'

/**
 * A library's own way to end a request: TanStack Router's `redirect(...)` and
 * `notFound()`, and Hono's `new HTTPException(status)`, which Hono answers
 * with that status.
 */
const isControlThrow = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  argument: TSESTree.Expression,
): boolean => {
  if (argument.type === 'CallExpression') {
    return (
      argument.callee.type === 'Identifier' &&
      isTanstackImport(importOf(sourceCode, argument.callee), ROUTER_THROWS)
    )
  }
  return (
    argument.type === 'NewExpression' &&
    argument.callee.type === 'Identifier' &&
    isHonoImport(importOf(sourceCode, argument.callee))
  )
}

const testsForErr = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  test: TSESTree.Expression,
  owner: string,
): boolean => {
  if (test.type === 'CallExpression') {
    return sourceCode.getText(test.callee) === `${owner}.isErr`
  }
  return (
    test.type === 'UnaryExpression' &&
    test.operator === '!' &&
    test.argument.type === 'CallExpression' &&
    sourceCode.getText(test.argument.callee) === `${owner}.isOk`
  )
}

const isUnderErrGuard = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  node: TSESTree.Node | null | undefined,
  owner: string,
): boolean => {
  if (isAbsent(node) || isFunction(node)) return false
  if (
    node.type === 'IfStatement' &&
    testsForErr(sourceCode, node.test, owner)
  ) {
    return true
  }
  return isUnderErrGuard(sourceCode, node.parent, owner)
}

/** `throw result.error` under `if (result.isErr())`: no-throw-result-error reports it. */
const isGuardedResultError = (
  sourceCode: Readonly<TSESLint.SourceCode>,
  argument: TSESTree.Expression,
): boolean =>
  argument.type === 'MemberExpression' &&
  !argument.computed &&
  argument.property.type === 'Identifier' &&
  argument.property.name === 'error' &&
  isUnderErrGuard(
    sourceCode,
    argument.parent,
    sourceCode.getText(argument.object),
  )

/** Every possible value carries a `_tag`, as TaggedError classes do. */
const isTagged = (checker: ts.TypeChecker, type: ts.Type): boolean => {
  const constraint = type.isTypeParameter()
    ? checker.getBaseConstraintOfType(type)
    : type
  if (constraint === undefined) return false
  if (constraint.isUnion()) {
    return constraint.types.every((member) => isTagged(checker, member))
  }
  const opaque = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never
  return (
    (constraint.getFlags() & opaque) === 0 &&
    constraint.getProperty('_tag') !== undefined
  )
}

/**
 * core.md "Errors as values" (Must): a failure is a value, and only a
 * programmer error takes the exceptional path. Every throw is reported except
 * a TaggedError thrown inside a function a library expects to throw (queryFn,
 * mutationFn, a router loader or beforeLoad, an XState fromPromise or
 * fromCallback actor, a TanStack Start server function, its validator or
 * middleware, a Worker's scheduled or queue handler), written in place or
 * passed by its name from the same file; TanStack Router's redirect and
 * notFound and Hono's HTTPException; and a
 * guarded `throw result.error`, which no-throw-result-error reports. A state
 * only a bug can reach is asserted with invariant() from
 * @ens-apps/utils/invariant, which is a call, not a throw.
 */
export const noThrow = createRule({
  name: 'no-throw',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Throw only a TaggedError where a library expects a throw; assert impossible states with invariant and return other failures as values',
    },
    messages: {
      thrown:
        "Do not throw here. If only a bug in our code can reach this line, assert the belief with invariant(condition, message) from @ens-apps/utils/invariant. If something outside the code (network, user, storage, chain) can cause it, return the failure as a value: a Result carrying a TaggedError. A throw belongs only in a function a library expects to throw (queryFn, mutationFn, a router loader or beforeLoad, an XState fromPromise or fromCallback actor, a server function or its validator, a Worker's scheduled handler), and there it throws a TaggedError.",
      untagged:
        "This function's library expects a throw, so throw a TaggedError class, not a bare Error or another value: the caller matches on its _tag. Better still, return a Result and let resultQueryOptions, resultMutationOptions or fromResultAsync throw for you. For a state only a bug can reach, use invariant(condition, message) from @ens-apps/utils/invariant.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode
    const services = ESLintUtils.getParserServices(context)
    const checker = services.program.getTypeChecker()
    return {
      ThrowStatement(node) {
        const argument = node.argument
        if (
          isControlThrow(sourceCode, argument) ||
          isGuardedResultError(sourceCode, argument)
        ) {
          return
        }
        if (!isInsideLibraryCallback(sourceCode, node.parent)) {
          context.report({ node, messageId: 'thrown' })
          return
        }
        if (isTagged(checker, services.getTypeAtLocation(argument))) return
        context.report({ node, messageId: 'untagged' })
      },
    }
  },
})
