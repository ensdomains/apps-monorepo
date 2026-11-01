import { ASTUtils, type TSESTree } from '@typescript-eslint/utils'
import { createRule } from './create.ts'

/** The apps' shadcn button module: `@/components/ui/button` or a relative path to it. */
const isUiButtonSource = (source: string): boolean =>
  /(?:^|\/)ui\/button(?:\.tsx?)?$/.test(source)

const isFalseLiteral = (value: TSESTree.JSXAttribute['value']): boolean =>
  value?.type === 'JSXExpressionContainer' &&
  value.expression.type === 'Literal' &&
  value.expression.value === false

/** The Button says what it does, or may get its type somewhere else. */
const isDecided = (
  attribute: TSESTree.JSXOpeningElement['attributes'][number],
): boolean =>
  attribute.type === 'JSXSpreadAttribute' ||
  (attribute.name.type === 'JSXIdentifier' &&
    (attribute.name.name === 'type' ||
      (attribute.name.name === 'asChild' && !isFalseLiteral(attribute.value))))

/**
 * STYLEGUIDE "Accessibility" and Greptile's button-type-attr (Default): a
 * button says whether it submits. Biome's useButtonType checks a literal
 * `<button>`; this checks the apps' shadcn `Button`, which renders a native
 * button with no default type, so inside a form it submits. Left alone: a
 * Button that spreads props or renders through `asChild` (its type can come
 * from elsewhere), and a Button reached through a namespace import.
 */
export const buttonType = createRule({
  name: 'button-type',
  meta: {
    type: 'problem',
    docs: { description: 'Give each shadcn Button an explicit type' },
    messages: {
      missing:
        'Give this Button a type: type="button", or type="submit" when it submits a form.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXOpeningElement(element) {
        if (element.name.type !== 'JSXIdentifier') return
        const variable = ASTUtils.findVariable(
          context.sourceCode.getScope(element),
          element.name.name,
        )
        const definition = variable?.defs[0]
        if (
          definition?.type !== 'ImportBinding' ||
          definition.parent.type !== 'ImportDeclaration' ||
          !isUiButtonSource(definition.parent.source.value)
        ) {
          return
        }
        if (!element.attributes.some(isDecided)) {
          context.report({ node: element.name, messageId: 'missing' })
        }
      },
    }
  },
})
