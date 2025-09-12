import { pgTable, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  address: text('address').primaryKey(),
})