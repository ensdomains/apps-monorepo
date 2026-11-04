declare const pgTable: (name: string, cols: Record<string, unknown>) => unknown
declare const text: (n: string) => any
declare const jsonb: (n: string) => any
declare const uuid: (n: string) => any
type AnyChannelData = { channel: string }
type PersonalNotificationKind = 'expiry' | 'renewal'

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey(),

  data: jsonb('data').notNull(), // expect: jsonb-needs-type

  payload: jsonb('payload') // expect: jsonb-needs-type
    .notNull()
    .default({}),

  channelData: jsonb('channel_data').$type<AnyChannelData>().notNull(),

  broadcastPayload: jsonb('broadcast_payload')
    .$type<AnyChannelData>()
    .notNull(),
  // KNOWN MISS (documented limit): an enum-like text column with no .$type<>() is not detected,
  // because telling "enum-like" from free text needs a name heuristic or the schema's meaning
  kind: text('kind').notNull(),

  kindTyped: text('kind_typed').$type<PersonalNotificationKind>().notNull(),
  displayName: text('display_name')
})
