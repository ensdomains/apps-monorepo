import type { RuleEntry } from './registry.ts'

const cell = (text: string): string => text.replaceAll('|', '\\|')

const sourcesOf = (rule: RuleEntry): string =>
  [
    ...rule.wiki.map((ref) => `wiki: ${ref}`),
    ...rule.styleguide.map((ref) => `STYLEGUIDE.md: ${ref}`),
    ...rule.greptile.map((ref) => `Greptile: \`${ref}\``),
  ].join('<br>')

/** The markdown table of every agent-lint rule and where it comes from. */
export const ruleTable = (rules: ReadonlyArray<RuleEntry>): string =>
  [
    '| Rule | What it holds | Sources |',
    '| --- | --- | --- |',
    ...rules.map(
      (rule) =>
        `| \`${rule.id}\` | ${cell(rule.what)}${rule.scope === undefined ? '' : ` Applies to ${rule.scope}.`} | ${cell(sourcesOf(rule))} |`,
    ),
  ].join('\n')

const START = (name: string) => `<!-- agent-lint:${name}:start -->`
const END = (name: string) => `<!-- agent-lint:${name}:end -->`

/** Replaces the generated block named `name` in `text`, keeping everything else. */
export const replaceBlock = (
  text: string,
  name: string,
  content: string,
): string => {
  const start = text.indexOf(START(name))
  const end = text.indexOf(END(name))
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no generated block named ${name}`)
  }
  return `${text.slice(0, start + START(name).length)}\n${content}\n${text.slice(end)}`
}
