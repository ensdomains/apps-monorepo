# Behaviour tests for the audit scanners; run from the repo root:
# python3 -m unittest discover -s docs/design-system-audit/scripts
import unittest

from inventory import cva_variants, cva_defaults, prop_defaults, prop_variants
from jsx import jsx_tags
from misuse import css_important, important_tokens
from variants import classify, count_values, prop_values


class ImportantModifiers(unittest.TestCase):
    def test_finds_modifier_after_variant_prefixes(self):
        line = "        'data-[variant=destructive]:*:[svg]:!text-destructive',"
        self.assertEqual(important_tokens(line), ['data-[variant=destructive]:*:[svg]:!text-destructive'])

    def test_finds_trailing_modifier_and_bare_utilities(self):
        line = '"group-data-[collapsible=icon]:size-8! !flex hidden! p-2"'
        self.assertEqual(important_tokens(line), ['group-data-[collapsible=icon]:size-8!', '!flex', 'hidden!'])

    def test_ignores_negation_copy_and_plain_classes(self):
        self.assertEqual(important_tokens("if (!isLoading && !compact) return 'p-0 text-sm'"), [])
        self.assertEqual(important_tokens('<p>{t`Your name is available!`}</p>'), [])

    def test_css_important_skips_comments(self):
        css = '/* never use !important */\na {\n  bottom: 20px !important;\n}\n'
        self.assertEqual(css_important(css), [(3, 'bottom: 20px !important;')])


class VariantExtraction(unittest.TestCase):
    def test_union_props_and_aliases_including_siblings(self):
        source = (
            "type Tone =\n  | 'info'\n  | 'danger'\n"
            "export interface InputProps {\n  variant?: 'default' | 'error' | 'success'\n"
            "  size?: 'default' | 'sm'\n  tone?: Tone\n  readonly color?: Pattern | null\n}\n"
        )
        sibling = "export type Pattern = 'garnet' | 'lapis'\n"
        self.assertEqual(prop_variants(source, sibling), {
            'variant': ['default', 'error', 'success'],
            'size': ['default', 'sm'],
            'tone': ['info', 'danger'],
            'color': ['garnet', 'lapis'],
        })

    def test_single_literals_are_not_variant_families(self):
        self.assertEqual(prop_variants("defaultVariants: {\n  variant: 'default',\n}\n  size?: string\n"), {})

    def test_cva_variants_and_defaults(self):
        source = (
            "const x = cva('base', {\n  variants: {\n    variant: {\n      default: 'a',\n      'entity-outline': 'b',\n"
            "    },\n    size: {\n      sm: 'c',\n    },\n  },\n  defaultVariants: {\n    variant: 'default',\n  },\n})\n"
        )
        self.assertEqual(cva_variants(source), {'variant': ['default', 'entity-outline'], 'size': ['sm']})
        self.assertEqual(cva_defaults(source), ['variant=default'])
        self.assertEqual(prop_defaults("({ variant = 'default', size = \"sm\" }) =>"), ['variant=default', 'size=sm'])


class VariantUsage(unittest.TestCase):
    def test_prop_values_literal_expression_and_forwarded(self):
        tag = "<Sheet side=\"right\" variant={'ghost'} size={isMobile ? 'bottom' : 'lg'} tone={tone} className=\"data-[side=left]:p-0\">"
        self.assertEqual(prop_values(tag, 'side'), ['right'])
        self.assertEqual(prop_values(tag, 'variant'), ['ghost'])
        self.assertEqual(prop_values(tag, 'size'), ['bottom', 'lg'])
        self.assertEqual(prop_values(tag, 'tone'), [None])

    def test_counts_only_inside_the_components_own_tags_and_cva_calls(self):
        text = '<Button size="sm" />\n<Input\n  size="lg"\n  variant={cond ? \'error\' : x}\n/>\nconst c = inputVariants({ size: \'sm\' })\n'
        families = {'size': ['default', 'sm', 'lg'], 'variant': ['default', 'error', 'success']}
        literal, dynamic = count_values([text], ['Input'], families, ['inputVariants'])
        self.assertEqual(literal['size'], {'default': 0, 'sm': 1, 'lg': 1})
        self.assertEqual(literal['variant'], {'default': 0, 'error': 1, 'success': 0})
        self.assertEqual(dynamic, {'size': 0, 'variant': 0})

    def test_classify_skips_defaults_and_flags_unresolved(self):
        literal = {'variant': {'default': 0, 'error': 0}, 'size': {'sm': 0, 'lg': 2}}
        self.assertEqual(classify(literal, {'variant': 1, 'size': 0}, {'variant=default'}), {
            'variant': ('unresolved', ['error']),
            'size': ('unused', ['sm']),
        })


class JsxTags(unittest.TestCase):
    def test_multi_line_tag_with_arrow_inside_braces(self):
        text = 'a\n<Button\n  onClick={() => go(a > b)}\n  size="icon"\n>x</Button>\n<ButtonGroup />'
        tags = list(jsx_tags(text, 'Button'))
        self.assertEqual(len(tags), 1)
        self.assertEqual(tags[0][0], 2)
        self.assertTrue(tags[0][1].endswith('size="icon"\n>'))


if __name__ == '__main__':
    unittest.main()
