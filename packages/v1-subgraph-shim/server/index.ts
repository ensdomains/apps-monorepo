/**
 * A local stand-in for the ENS V1 subgraph.
 *
 *     PORT=5656 RPC_URL=http://127.0.0.1:8545 node server/index.ts
 *
 * **Why this exists.** The apps read V1 names — subname lists, which text-record
 * keys to bother fetching, name history — from `v1-graphql.ens.dev`. That is the
 * live public Sepolia subgraph, and every name this suite creates lives on an
 * Anvil fork that diverged from Sepolia minutes ago. The public subgraph cannot
 * know those names and never will, so locally the Subnames tab is always empty,
 * custom record keys are never discovered, and history renders "no activity" for
 * a name with real events. Each of those reads as a product bug and is not one.
 *
 * **Why it indexes rather than mocks.** Answers come from the fork's own logs,
 * so a test that asserts "the subnames tab lists the subname" is still anchored
 * to chain state — the same rank of oracle as reading the registry directly.
 * A fixture-backed mock would instead assert "our mock returned this and the app
 * rendered it", which is the bottom of the oracle hierarchy in
 * `e2e/docs/e2e-build-goal.md` §4 and worse than the honest gap it replaces.
 *
 * **Why it is safe to point at.** It refuses to answer anything it does not
 * model, rather than returning an empty list. An indexer that answers 200 with
 * zero rows is indistinguishable from a true negative, and the UI renders it as
 * a confident "nothing here" — the single most expensive failure mode available
 * to this class of service.
 */

import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { serve } from '@hono/node-server'
import { buildSchema, graphql } from 'graphql'
import { type Context, Hono } from 'hono'
import { Indexer } from './indexer.ts'
import { makeResolvers } from './resolvers.ts'
import { typeDefs } from './schema.ts'
import { Store } from './store.ts'

const PORT = Number(process.env.PORT ?? 5656)
const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545'

/**
 * Addresses come from ensjs, never from literals here.
 *
 * This repo has been bitten twice by a local service pinned to addresses the
 * apps had moved off: the Panoptes manifest pointed at a superseded registry
 * and silently skipped every event from the live one, and the 2026-09-15
 * redeploy moved five more. A shim pinned to yesterday's deployment indexes an
 * empty world and reports it as an empty world. Reading the same config the
 * apps read means this cannot drift from them by construction.
 */
const v1 = ensL1Contracts[supportedL1Chains.sepolia] as Record<
  string,
  { address?: `0x${string}` } | undefined
>
const required = (key: string): `0x${string}` => {
  const address = v1[key]?.address
  if (!address) {
    throw new Error(
      `[v1-subgraph-shim] ensjs has no address for "${key}" on sepolia — refusing to start rather than index nothing`,
    )
  }
  return address
}
const CONTRACTS = {
  registry: required('ensLegacyRegistry'),
  registrar: required('ensBaseRegistrarImplementation'),
  controller: required('ensEthRegistrarController'),
  nameWrapper: required('ensNameWrapper'),
}

const store = new Store()
const indexer = new Indexer(RPC_URL, CONTRACTS, store)
const schema = buildSchema(typeDefs)
const rootValue = makeResolvers({
  store,
  indexedHead: () => indexer.indexedHead,
})

/**
 * Attach every resolver to the schema's type map, `Query` included.
 *
 * Not via `rootValue`: `graphql()` invokes a root-value function as
 * `fn(args, context, info)` — no parent — while every other field resolver is
 * `fn(parent, args, context, info)`. Mixing the two conventions in one file is
 * how `domain(id:)` ended up destructuring `undefined`. Patching the type map
 * also gives per-type field resolvers and `__resolveType`, and the event
 * interfaces are the whole reason Panoptes could not be used here.
 */
const attachResolvers = () => {
  const map = schema.getTypeMap()
  for (const [typeName, fields] of Object.entries(rootValue)) {
    if (!fields) continue
    const type = map[typeName] as {
      getFields?: () => Record<string, { resolve?: unknown }>
      resolveType?: unknown
    }
    if (!type) continue
    for (const [fieldName, fn] of Object.entries(
      fields as Record<string, unknown>,
    )) {
      if (fieldName === '__resolveType') {
        type.resolveType = fn
        continue
      }
      const field = type.getFields?.()[fieldName]
      if (field) field.resolve = fn
    }
  }
}
attachResolvers()

const app = new Hono()

app.get('/health', async (c) => {
  await indexer.sync().catch(() => {})
  return c.json({
    ok: true,
    indexedHead: indexer.indexedHead,
    domains: store.domains.size,
    resolvers: store.resolvers.size,
  })
})

const handle = async (c: Context) => {
  const body = (await c.req.json()) as {
    query?: string
    variables?: Record<string, unknown>
    operationName?: string
  }
  if (!body?.query) {
    return c.json({ errors: [{ message: 'no query supplied' }] }, 400)
  }

  // Sync per request. The fork adds blocks in handfuls, so this costs almost
  // nothing, and it removes "the shim was behind" as a category of bug.
  try {
    await indexer.sync()
  } catch (error) {
    return c.json(
      {
        errors: [
          {
            message: `[v1-subgraph-shim] could not reach the fork at ${RPC_URL}: ${String(error).split('\n')[0]}. Refusing to answer from a stale world.`,
          },
        ],
      },
      503,
    )
  }

  const result = await graphql({
    schema,
    source: body.query,
    variableValues: body.variables,
    operationName: body.operationName,
  })
  return c.json(result as Record<string, unknown>)
}

app.post('/', handle)
app.post('/subgraph', handle)
app.post('/graphql', handle)

// Anything else is a query shape this shim has not been taught. Saying so is
// the point: a 404 is debuggable, an empty list is a lie the UI will render.
app.all('*', (c) =>
  c.json(
    {
      errors: [
        {
          message: `[v1-subgraph-shim] no handler for ${c.req.method} ${new URL(c.req.url).pathname}. POST GraphQL to /subgraph.`,
        },
      ],
    },
    404,
  ),
)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(
    `[v1-subgraph-shim] listening on :${info.port}, indexing ${RPC_URL}`,
  )
  console.log(`[v1-subgraph-shim] registry     ${CONTRACTS.registry}`)
  console.log(`[v1-subgraph-shim] registrar    ${CONTRACTS.registrar}`)
  console.log(`[v1-subgraph-shim] controller   ${CONTRACTS.controller}`)
  console.log(`[v1-subgraph-shim] nameWrapper  ${CONTRACTS.nameWrapper}`)
})
