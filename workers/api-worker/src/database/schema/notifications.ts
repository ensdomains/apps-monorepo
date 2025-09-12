import { relations } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { randomUUIDv7 } from '../utils/schemaHelpers'
import { users } from './core'

type UserChannelStatus = 'pending' | 'verified' | 'bounced' | 'unsubscribed'

export const userChannels = pgTable(
  'user_channels',
  {
    id: uuid('id').primaryKey().default(randomUUIDv7),
    user_address: text('user_address')
      .notNull()
      .references(() => users.address, {
        onDelete: 'cascade',
      }),
    /**
     * Which medium (email, push, telegram)
     */
    channel: text('channel').$type<DeliveryChannel>().notNull(),
    /**
     * The actual identifier (email address, FCM endpoint, etc)
     */
    target: text('target').notNull(),
    /**
     * When the channel was verified
     */
    verified_at: timestamp('verified_at', { withTimezone: true }),
    /**
     * The status of the channel, tracks lifecycle beyond verification
     */
    status: text('status').$type<UserChannelStatus>().notNull(),
    /**
     * Why a channel is in its current status
     */
    status_reason: text('status_reason'),
    /**
     * When the channel was last sent
     */
    last_sent_at: timestamp('last_sent_at', { withTimezone: true }),
    /**
     * When the channel was last bounced
     */
    last_bounce_at: timestamp('last_bounce_at', { withTimezone: true }),
  },
  (table) => [
    unique('user_channel_unique').on(
      table.user_address,
      table.channel,
      table.target,
    ),
  ],
)

export const userChannelRelations = relations(
  userChannels,
  ({ one, many }) => ({
    user: one(users, {
      fields: [userChannels.user_address],
      references: [users.address],
    }),
    notifications: many(notifications),
  }),
)

// ===============================

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().default(randomUUIDv7),
    user_address: text('user_address')
      .notNull()
      .references(() => users.address, {
        onDelete: 'cascade',
      }),
    kind: text('kind').$type<NotificationKind>().notNull(),
    channel: text('channel').$type<DeliveryChannel>().notNull(),
    enabled: boolean('enabled').default(true),
    extra_config: jsonb('extra_config'),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique('notification_preference_unique').on(
      table.user_address,
      table.kind,
      table.channel,
    ),
  ],
)

export const notificationPreferenceRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.user_address],
      references: [users.address],
    }),
  }),
)

// ===============================

export type NotificationKind = 'name-expiry'

export const notifications = pgTable('notifications', {
  /**
   * Notification ID
   */
  id: uuid('id').primaryKey().default(randomUUIDv7),
  /**
   * User wallet address
   */
  user_address: text('user_address')
    .notNull()
    .references(() => users.address, {
      onDelete: 'cascade',
    }),
  /**
   * Notification kind
   */
  kind: text('kind').$type<NotificationKind>().notNull(),
  /**
   * Payload
   */
  payload: jsonb('payload'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  read_at: timestamp('read_at', { withTimezone: true }),
  archived_at: timestamp('archived_at', { withTimezone: true }),
  idempotency_key: text('idempotency_key').unique().notNull(),
})

export const notificationRelations = relations(
  notifications,
  ({ one, many }) => ({
    user: one(users, {
      fields: [notifications.user_address],
      references: [users.address],
    }),
    deliveries: many(notificationDeliveries),
  }),
)

// ===============================

type DeliveryChannel = 'email' | 'push' | 'telegram'
type DeliveryStatus = 'queued' | 'delivered' | 'failed'

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').primaryKey().default(randomUUIDv7),
  notification_id: uuid('notification_id')
    .notNull()
    .references(() => notifications.id, {
      onDelete: 'cascade',
    }),
  channel: text('channel').$type<DeliveryChannel>().notNull(),
  target: text('target').notNull(),
  status: text('status').$type<DeliveryStatus>().notNull(),
  attempts: integer('attempts').default(0),

  provider_msg_id: text('provider_msg_id'),

  error: text('error'),

  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const notificationDeliveryRelations = relations(
  notificationDeliveries,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationDeliveries.notification_id],
      references: [notifications.id],
    }),
  }),
)

// ===============================

export type BroadcastKind = 'blog-post'
export const broadcasts = pgTable('broadcasts', {
  id: uuid('id').primaryKey().default(randomUUIDv7),
  kind: text('kind').$type<BroadcastKind>().notNull(),
  payload: jsonb('payload'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const broadcastRelations = relations(broadcasts, ({ many }) => ({
  seen: many(broadcastsSeen),
}))

// ===============================

export const broadcastsSeen = pgTable(
  'broadcasts_seen',
  {
    user_address: text('user_address')
      .notNull()
      .references(() => users.address, {
        onDelete: 'cascade',
      }),
    broadcast_id: uuid('broadcast_id')
      .notNull()
      .references(() => broadcasts.id, {
        onDelete: 'cascade',
      }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.user_address, table.broadcast_id],
    }),
  ],
)

export const broadcastsSeenRelations = relations(broadcastsSeen, ({ one }) => ({
  broadcast: one(broadcasts, {
    fields: [broadcastsSeen.broadcast_id],
    references: [broadcasts.id],
  }),
  user: one(users, {
    fields: [broadcastsSeen.user_address],
    references: [users.address],
  }),
}))
