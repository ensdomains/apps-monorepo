import { ASTUtils } from '@typescript-eslint/utils'
import { createRule } from './create.ts'

const SIZE_PROPS: ReadonlySet<string> = new Set(['size', 'width', 'height'])

const isLucideSource = (source: string): boolean =>
  source === 'lucide-react' || source.startsWith('lucide-react/')

/**
 * styling.md "Size icons with size-* classes, not width, height or size props"
 * (Guideline). Only elements whose name is imported from lucide-react are
 * checked, so a local component that happens to take a size prop is left alone.
 */
export const iconSizeClasses = createRule({
  name: 'icon-size-classes',
  meta: {
    type: 'suggestion',
    docs: { description: 'Size lucide icons with size-* classes' },
    messages: {
      prop: 'Size icons with a size-* class (for example className="size-4"), not the `{{prop}}` prop.',
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
          !isLucideSource(definition.parent.source.value)
        ) {
          return
        }
        for (const attribute of element.attributes) {
          if (
            attribute.type === 'JSXAttribute' &&
            attribute.name.type === 'JSXIdentifier' &&
            SIZE_PROPS.has(attribute.name.name)
          ) {
            context.report({
              node: attribute,
              messageId: 'prop',
              data: { prop: attribute.name.name },
            })
          }
        }
      },
    }
  },
})
