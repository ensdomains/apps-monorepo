import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { createRule } from './create.ts'

const TESTID_QUERY = /^(?:get|query|find)(?:All)?ByTestId$/u
const SELECTOR_QUERY = /^querySelector(?:All)?$/u

/** Selectors for markup no role reaches: decorative images, icons, slots. */
const DECORATIVE_SELECTOR =
  /\b(?:img|svg)\b|\[(?:src|alt|aria-hidden|data-slot)\b/u

type StaticText = { readonly text: string; readonly whole: boolean }

const isNode = (value: unknown): value is TSESTree.Node =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  typeof value.type === 'string'

const asNodes = (value: unknown): ReadonlyArray<TSESTree.Node> => {
  if (Array.isArray(value)) return value.filter(isNode)
  return isNode(value) ? [value] : []
}

/** Every node under `node`, following the parser's visitor keys. */
const descendants = (
  node: TSESTree.Node,
  keys: TSESLint.SourceCode.VisitorKeys,
): ReadonlyArray<TSESTree.Node> => {
  const childKeys = keys[node.type] ?? []
  const children = Object.entries(node).flatMap(([key, value]) =>
    childKeys.includes(key) ? asNodes(value) : [],
  )
  return [node, ...children.flatMap((child) => descendants(child, keys))]
}

const methodName = (call: TSESTree.CallExpression): string | undefined => {
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

/** A string literal's value, or the static start of a template literal. */
const staticText = (
  node: TSESTree.Node | null | undefined,
): StaticText | undefined => {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return { text: node.value, whole: true }
  }
  if (node?.type === 'TemplateLiteral') {
    return {
      text: node.quasis[0]?.value.cooked ?? '',
      whole: node.expressions.length === 0,
    }
  }
  if (node?.type === 'JSXExpressionContainer')
    return staticText(node.expression)
  return undefined
}

const declaredTestIds = (
  nodes: ReadonlyArray<TSESTree.Node>,
): ReadonlyArray<StaticText> =>
  nodes.flatMap((node) => {
    if (
      node.type !== 'JSXAttribute' ||
      node.name.type !== 'JSXIdentifier' ||
      node.name.name !== 'data-testid'
    ) {
      return []
    }
    const text = staticText(node.value)
    return text === undefined ? [] : [text]
  })

/** True when the queried id is one the file renders itself. */
const isDeclared = (
  id: StaticText,
  declared: ReadonlyArray<StaticText>,
): boolean =>
  declared.some((known) => {
    if (known.whole && id.whole) return known.text === id.text
    if (!known.whole) return known.text !== '' && id.text.startsWith(known.text)
    return known.text.startsWith(id.text)
  })

type Finding = {
  readonly node: TSESTree.CallExpression
  readonly messageId: 'testid' | 'selector'
  readonly data: { readonly id: string }
}

/** The test-id and selector queries among `nodes` that the rule reports. */
const findingsIn = (
  nodes: ReadonlyArray<TSESTree.Node>,
  declared: ReadonlyArray<StaticText>,
): ReadonlyArray<Finding> =>
  nodes.flatMap((node): ReadonlyArray<Finding> => {
    if (node.type !== 'CallExpression') return []
    const method = methodName(node) ?? ''
    const id = staticText(node.arguments[0])
    if (id === undefined) return []
    if (TESTID_QUERY.test(method) && !isDeclared(id, declared)) {
      return [{ node, messageId: 'testid', data: { id: id.text } }]
    }
    if (SELECTOR_QUERY.test(method) && !DECORATIVE_SELECTOR.test(id.text)) {
      return [{ node, messageId: 'selector', data: { id: id.text } }]
    }
    return []
  })

/**
 * testing.md "Test from the user's perspective": query by role, label or
 * text, not by test id or selector. A test id the test file declares itself,
 * in the markup of a stub it renders, is fair game, and so is a selector for
 * markup no role can reach (a decorative image, an icon, a slot).
 */
export const noForeignTestid = createRule({
  name: 'no-foreign-testid',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Query by role, label or text, not by a test id or selector',
    },
    messages: {
      testid:
        'Query by role, label or text the way a user finds the element, not by the test id `{{id}}`.',
      selector:
        'Query by role, label or text the way a user finds the element, not with the selector `{{id}}`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(program) {
        const nodes = descendants(program, context.sourceCode.visitorKeys)
        for (const finding of findingsIn(nodes, declaredTestIds(nodes))) {
          context.report(finding)
        }
      },
    }
  },
})
