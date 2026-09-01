/**
 * Passthrough template tag for v1 subgraph documents.
 *
 * ensjs's `SubgraphClient.request` takes the query as a **string**, not a
 * `DocumentNode` — it re-parses each query itself to inject `id` selections.
 * So these queries can't use urql's `gql`, which returns a parsed document.
 *
 * This exists purely so editors, formatters and linters — which key off a
 * template tag literally named `gql` — keep highlighting them. ensjs has the
 * same helper internally but doesn't export it.
 */
export const gql = (
  chunks: TemplateStringsArray,
  ...variables: unknown[]
): string =>
  chunks.reduce(
    (acc, chunk, index) =>
      `${acc}${chunk}${index in variables ? String(variables[index]) : ''}`,
    '',
  )
