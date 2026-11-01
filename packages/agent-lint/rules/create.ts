import { ESLintUtils } from '@typescript-eslint/utils'

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/ensdomains/apps-monorepo/blob/main/packages/agent-lint/README.md#${name}`,
)
