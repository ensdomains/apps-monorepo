// Hono-style handlers (types are stand-ins; the plugin only looks at syntax)
declare const app: { post: (path: string, ...handlers: unknown[]) => void }
declare function vValidator(target: string, schema: unknown): unknown
declare const UpsertTransactionSchema: unknown


app.post('/raw', async (c: any) => {
  const body = (await c.req.json()) as { id: string } // expect: no-raw-request-reads
  return c.json(body)
})


app.post('/query', async (c: any) => {
  const origin = c.req.query('origin') // expect: no-raw-request-reads
  return c.text(origin ?? '')
})


app.post('/ok', vValidator('json', UpsertTransactionSchema), async (c: any) => {
  const body = c.req.valid('json')
  return c.json(body)
})
