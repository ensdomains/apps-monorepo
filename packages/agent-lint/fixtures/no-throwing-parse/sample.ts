import * as v from 'valibot'
declare const fromThrowable: (fn: () => unknown) => unknown

const EventSchema = v.object({ id: v.string() })

export const consume = (body: unknown) => {
  const event = v.parse(EventSchema, body) // expect: no-throwing-parse
  return event.id
}

export const consumeAsync = async (body: unknown) => v.parseAsync(EventSchema, body) // expect: no-throwing-parse

export const lifted = (body: unknown) => fromThrowable(() => v.parse(EventSchema, body))

export const consumeSafe = (body: unknown) => {
  const parsed = v.safeParse(EventSchema, body)
  return parsed.success ? parsed.output.id : null
}
