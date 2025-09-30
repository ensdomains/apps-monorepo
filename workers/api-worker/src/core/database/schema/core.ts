import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { randomUUIDv7 } from '../utils/schemaHelpers'

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(randomUUIDv7),
    address: text('address').notNull().unique(),
  },
  (table) => [index('users_address_index').on(table.address)],
)
