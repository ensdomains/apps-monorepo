import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { replaceBlock, ruleTable } from './docs.ts'
import { packageDir } from './paths.ts'
import { RULES } from './registry.ts'

const readme = join(packageDir, 'README.md')
writeFileSync(
  readme,
  replaceBlock(readFileSync(readme, 'utf8'), 'rules', ruleTable(RULES)),
)
process.stdout.write(`wrote the rule table to ${readme}\n`)
