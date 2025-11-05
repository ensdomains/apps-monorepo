import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import {
  ChannelType,
  channelSupportsNotification,
} from '#config/notifications.js'
import { type Database, TABLE } from '#core/database/index.js'
import { createNotification } from '#services/notifications/create.js'
import { getExpiry, getExpiryForNames } from './index.js'
import { v7 as uuidv7 } from 'uuid';
import { BaseDeliveryJob, PushDeliveryJob } from '#types/delivery.js'
import { chunk } from '#utils/chunk.js'

/**
 * Notification thresholds in days before expiry.
 * We send notifications at 30 days, 7 days, and 1 day before expiry.
 */
const THRESHOLDS = [30, 7, 1] // days before expiry

/**
 * Maximum number of names to process in a single cron run.
 * This prevents overwhelming the ENS subgraph and keeps cron runs under time limits.
 */
const BATCH_SIZE = 50

/**
 * How long to lease a name for processing (in minutes).
 * This prevents multiple cron workers from processing the same name simultaneously.
 */
const LEASE_DURATION_MINUTES = 5

async function leaseDueNames(db: Database) {
  const now = new Date()
  const leaseUntil = new Date(
    now.getTime() + LEASE_DURATION_MINUTES * 60 * 1000,
  )

  // Subquery to filter names due for evaluation and limit the batch size
  const dueQuery = db.$with('due').as(
    db
      .select({ name: TABLE.ensEvalPointers.name })
      .from(TABLE.ensEvalPointers)
      .for('update', { skipLocked: true })
      .where(
        and(
          lte(TABLE.ensEvalPointers.next_eval_at, now),
          or(
            isNull(TABLE.ensEvalPointers.lease_until),
            lte(TABLE.ensEvalPointers.lease_until, now),
          ),
        ),
      )
      .limit(BATCH_SIZE),
  )

  // Update the eval pointers with the lease until time and the updated at time and return the names that were leased
  return db
    .with(dueQuery)
    .update(TABLE.ensEvalPointers)
    .set({
      lease_until: leaseUntil,
      updated_at: now,
    })
    .from(dueQuery)
    .where(eq(TABLE.ensEvalPointers.name, dueQuery.name))
    .returning({
      name: TABLE.ensEvalPointers.name,
      next_eval_at: TABLE.ensEvalPointers.next_eval_at,
    })
}

function getNextThreshold(expiryTime: number) {
  const now = Date.now()
  const daysUntilExpiry = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24))
  for (const threshold of THRESHOLDS) {
    if (daysUntilExpiry <= threshold && daysUntilExpiry > 0) {
      return threshold
    }
  }
}

async function processNames({
  env,
  db,
  names,
}: {
  env: CloudflareBindings
  db: Database
  names: string[]
}) {
  // ================================================
  // Get updated expiry data & owner data for the names
  const freshData = await getExpiryForNames(names)

  /** Names that was wanted but couldn't be found in the indexer */
  const missingNames = names.filter((name) => !freshData.has(name))
  if (missingNames.length > 0) {
    console.warn(`Names not found in the indexer: ${missingNames.join(', ')}`)
  }

  const namesToCheck = names.filter((name) => freshData.has(name))

  // Get all watchers for the names with their user ids
  const watchers = await db.query.ensWatchers.findMany({
    where: inArray(TABLE.ensWatchers.name, namesToCheck),
    columns: {
      name: true,
      user_id: true,
    },
    with: {
      user: {
        columns: {
          address: true,
        },
      },
    },
  })

  const notificationsToCreate: {
    userId: string
    name: string
    expiryDate: Date
    isOwner: boolean
    threshold: number
    idempotencyKey: string
    id: string;
  }[] = []

  let notificationsCounter = 0
  for (const watcher of watchers) {
    const nameData = freshData.get(watcher.name)
    if (!nameData) {
      console.warn(`Name ${watcher.name} not found in the indexer`)
      continue
    }

    if (!nameData.expiryDate) {
      console.warn(`Name ${watcher.name} has no expiry date`)
      continue
    }

    const nextThreshold = getNextThreshold(nameData.expiryDate.getTime())
    if (!nextThreshold) {
      console.warn(`Name ${watcher.name} has no next threshold`)
      continue
    }

    notificationsToCreate.push({
      userId: watcher.user_id,
      name: watcher.name,
      expiryDate: nameData.expiryDate,
      isOwner: nameData.owner === watcher.user.address,
      threshold: nextThreshold,
      idempotencyKey: `name-expiry:${watcher.user_id}:${watcher.name}:${nextThreshold}:${nameData.expiryDate.getTime()}`,
      id: uuidv7({
        seq: notificationsCounter++,
      }),
    })
  }

  const watchingUserIds = Array.from(
    new Set(watchers.map((watcher) => watcher.user_id)),
  )

  const userChannelsMap = await db.query.userChannels
    .findMany({
      where: and(
        inArray(TABLE.userChannels.user_id, watchingUserIds),
        eq(TABLE.userChannels.status, 'verified'),
      ),
      columns: {
        user_id: true,
        channel: true,
        target: true,
      },
    })
    .then((result) => Map.groupBy(result, (r) => r.user_id))

  const notificationPreferences = await db.query.notificationPreferences
    .findMany({
      where: and(
        inArray(TABLE.notificationPreferences.user_id, watchingUserIds),
        eq(TABLE.notificationPreferences.kind, 'name-expiry'),
      ),
      columns: {
        user_id: true,
        channel: true,
        enabled: true,
      },
    })
    .then((result) => Map.groupBy(result, (r) => r.user_id))

  await db
    .insert(TABLE.notifications)
    .values(
      notificationsToCreate.map((notification) => ({
        id: notification.id,
        user_id: notification.userId,
        kind: 'name-expiry' as const,
        idempotency_key: notification.idempotencyKey,
        payload: {
          name: notification.name,
          expiryDate: notification.expiryDate.getTime(),
          isOwner: notification.isOwner,
        },
      })),
    )

  const deliveriesToCreate: (typeof TABLE.notificationDeliveries.$inferInsert)[] =
    []
  const telegramJobs: BaseDeliveryJob[] = []
  const emailJobs: BaseDeliveryJob[] = []

  let deliveriesCounter = 0
  for (const notification of notificationsToCreate) {

    const channels = userChannelsMap.get(notification.userId)
    if (!channels) {
      console.warn(`Channels for user ${notification.userId} not found`)
      continue
    }

    const preferences = notificationPreferences.get(notification.userId)

    for (const channel of channels) {
      if (
        !channelSupportsNotification(channel.channel, 'name-expiry') ||
        !channel.target
      ) {
        continue
      }

      const preference = preferences?.find((p) => p.channel === channel.channel)

      // If explicitly disabled, skip
      if (preference && !preference.enabled) {
        continue
      }

      const deliveryId = uuidv7({
        seq: deliveriesCounter++,
      })

      deliveriesToCreate.push({
        notification_id: notification.id,
        channel: channel.channel,
        target: channel.target,
        status: 'queued',
        attempts: 0,
        id: deliveryId,
      })

      switch (channel.channel) {
        case 'telegram': {
          telegramJobs.push({
            id: deliveryId,
            notificationId: notification.id,
            userId: notification.userId,
            kind: 'name-expiry',
          })
          break
        }
        case 'email': {
          emailJobs.push({
            id: deliveryId,
            notificationId: notification.id,
            userId: notification.userId,
            kind: 'name-expiry',
          })
          break
        }
        default: {
          console.warn(`Unknown channel: ${channel.channel}`)
          continue
        }
      }
    }
  }

  await db
    .insert(TABLE.notificationDeliveries)
    .values(deliveriesToCreate)

  // chunk the jobs into batches of 95 and send them to the queue
  const telegramJobsBatches = chunk(telegramJobs, 95)
  const emailJobsBatches = chunk(emailJobs, 95)

  for (const batch of telegramJobsBatches) {
    await env.TELEGRAM_QUEUE.sendBatch(batch.map((job) => ({ body: job })))
  }

  for (const batch of emailJobsBatches) {
    await env.EMAIL_QUEUE.sendBatch(batch.map((job) => ({ body: job })))
  }
}

/**
 * Main entry point for the expiry evaluation cron job.
 *
 * This function orchestrates the entire expiry checking process:
 * 1. Leases names that are due for evaluation (prevents concurrent processing)
 * 2. Fetches fresh expiry and ownership data from the ENS subgraph
 * 3. Processes each name to check thresholds and create notifications
 * 4. Updates eval pointers with next check times
 *
 * The function is designed to be resilient - if one name fails to process,
 * it continues with the others rather than failing the entire batch.
 *
 * @param env - Cloudflare environment bindings (for notification creation)
 * @param db - Database connection for data operations
 */
// OLD FUNCTION, SEE processNames FOR NEW IMPLEMENTATION
export async function evaluateExpiringNames(
  env: CloudflareBindings,
  db: Database,
): Promise<void> {
  console.log('Starting expiry evaluation cron job')

  try {
    // 1. Lease due names from eval pointers
    const leasedNames = await leaseDueNamesOld(db)
    console.log(`Leased ${leasedNames.length} names for evaluation`)

    if (leasedNames.length === 0) {
      console.log('No names due for evaluation')
      return
    }

    // 2. Fetch fresh data from ENS subgraph
    const namesToCheck = leasedNames.map(
      (pointer: { name: string }) => pointer.name,
    )
    const freshData = await getExpiry(namesToCheck)
    console.log(`Fetched fresh data for ${freshData.length} names`)

    // 3. Process each name
    let processedCount = 0
    let notificationCount = 0

    for (const nameData of freshData) {
      try {
        const notificationsCreated = await processName({ env, db, nameData })
        notificationCount += notificationsCreated
        processedCount++
      } catch (error) {
        console.error(`Error processing name ${nameData.name}:`, error)
        // Continue with other names even if one fails
      }
    }

    console.log(
      `Processed ${processedCount} names, created ${notificationCount} notifications`,
    )
  } catch (error) {
    console.error('Error in expiry evaluation:', error)
    throw error
  }
}

/**
 * Leases names that are due for evaluation using database-level locking.
 *
 * This function uses SELECT FOR UPDATE SKIP LOCKED to prevent multiple cron workers
 * from processing the same names simultaneously. It only leases names that:
 * 1. Are due for evaluation (next_eval_at <= now)
 * 2. Are not currently leased by another worker (lease_until IS NULL OR lease_until <= now)
 *
 * The lease prevents other workers from processing the same names for LEASE_DURATION_MINUTES.
 *
 * IDEAL SQL QUERY:
 * ```sql
 * UPDATE ens_eval_pointers
 * SET lease_until = $1, updated_at = $2
 * WHERE next_eval_at <= $3
 *   AND (lease_until IS NULL OR lease_until <= $3)
 * RETURNING name, next_eval_at
 * LIMIT 50;
 * ```
 *
 * @param db - Database connection
 * @returns Array of leased names with their evaluation times
 */
async function leaseDueNamesOld(db: Database) {
  const now = new Date()
  const leaseUntil = new Date(
    now.getTime() + LEASE_DURATION_MINUTES * 60 * 1000,
  )

  const due = db.$with('due').as(
    db
      .select({ name: TABLE.ensEvalPointers.name })
      .from(TABLE.ensEvalPointers)
      .for('update', { skipLocked: true })
      .where(
        and(
          lte(TABLE.ensEvalPointers.next_eval_at, now),
          or(
            isNull(TABLE.ensEvalPointers.lease_until),
            lte(TABLE.ensEvalPointers.lease_until, now),
          ),
        ),
      )
      .limit(BATCH_SIZE),
  )

  const result = await db
    .with(due)
    .update(TABLE.ensEvalPointers)
    .set({
      lease_until: leaseUntil,
      updated_at: now,
    })
    .where(eq(TABLE.ensEvalPointers.name, due.name))
    .returning({
      name: TABLE.ensEvalPointers.name,
      next_eval_at: TABLE.ensEvalPointers.next_eval_at,
    })

  // // Use FOR UPDATE SKIP LOCKED to prevent concurrent processing
  // const result = await db
  //   .update(ensEvalPointers)
  //   .set({
  //     lease_until: leaseUntil,
  //     updated_at: now,
  //   })
  //   .where(
  //     and(
  //       lte(ensEvalPointers.next_eval_at, now),
  //       sql`${ensEvalPointers.lease_until} IS NULL OR ${ensEvalPointers.lease_until} <= ${now}`,
  //     ),
  //   )
  //   .returning({
  //     name: ensEvalPointers.name,
  //     next_eval_at: ensEvalPointers.next_eval_at,
  //   })
  //   .limit(BATCH_SIZE)

  return result
}

/**
 * Processes a single name for expiry evaluation and notification creation.
 *
 * This function handles the core logic for each name:
 * 1. Updates the ens_names table with fresh expiry data from the subgraph
 * 2. Gets all watchers for this name
 * 3. For each watcher, determines ownership and checks notification thresholds
 * 4. Creates notifications for crossed thresholds
 * 5. Calculates and updates the next evaluation time
 *
 * @param env - Cloudflare environment bindings
 * @param db - Database connection
 * @param nameData - Fresh data from ENS subgraph (name, expiryDate, owner)
 * @returns Number of notifications created for this name
 */
async function processName({
  env,
  db,
  nameData,
}: {
  env: CloudflareBindings
  db: Database
  nameData: { name: string; expiryDate: Date | null; owner: string | null }
}): Promise<number> {
  const { name, expiryDate, owner } = nameData

  if (!expiryDate) {
    console.log(`Name ${name} has no expiry date, skipping`)
    await updateEvalPointer(db, name, null) // Remove from evaluation
    return 0
  }

  // 3. Update ens_names with fresh data
  // IDEAL SQL QUERY:
  // ```sql
  // INSERT INTO ens_names (name, expiry_at, last_checked_at, updated_at)
  // VALUES ($1, $2, $3, $4)
  // ON CONFLICT (name)
  // DO UPDATE SET
  //   expiry_at = EXCLUDED.expiry_at,
  //   last_checked_at = EXCLUDED.last_checked_at,
  //   updated_at = EXCLUDED.updated_at;
  // ```
  await db
    .insert(TABLE.ensNames)
    .values({
      name,
      expiry_at: expiryDate,
      last_checked_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: TABLE.ensNames.name,
      set: {
        expiry_at: expiryDate,
        last_checked_at: new Date(),
        updated_at: new Date(),
      },
    })

  // 4. Get all watchers for this name
  // IDEAL SQL QUERY:
  // ```sql
  // SELECT * FROM ens_watchers WHERE name = $1;
  // ```
  const watchers = await db
    .select()
    .from(TABLE.ensWatchers)
    .where(eq(TABLE.ensWatchers.name, name))

  if (watchers.length === 0) {
    console.log(`No watchers for ${name}, removing eval pointer`)
    await updateEvalPointer(db, name, null)
    return 0
  }

  // 5. Check each watcher's thresholds and create notifications
  let notificationsCreated = 0
  const now = Date.now()
  const expiryTime = expiryDate.getTime()
  const daysUntilExpiry = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24))

  for (const watcher of watchers) {
    // Get user address from user_id to compare with owner
    // IDEAL SQL QUERY:
    // ```sql
    // SELECT address FROM users WHERE id = $1 LIMIT 1;
    // ```
    const user = await db
      .select({ address: sql<string>`address` })
      .from(sql`users`)
      .where(sql`id = ${watcher.user_id}`)
      .limit(1)

    const userAddress = user[0]?.address
    const isOwner = owner === userAddress

    // Check if any threshold was crossed
    for (const threshold of THRESHOLDS) {
      if (daysUntilExpiry <= threshold && daysUntilExpiry > 0) {
        const idempotencyKey = `name-expiry:${name}:${watcher.user_id}:${threshold}:${expiryTime}`

        try {
          await createNotification({
            env,
            db,
            userId: watcher.user_id,
            kind: 'name-expiry',
            payload: {
              name,
              expiryDate: expiryTime,
              isOwner,
            },
            idempotencyKey,
          })
          notificationsCreated++
          console.log(
            `Created notification for ${name} (${threshold} days) for user ${watcher.user_id}`,
          )
        } catch (error) {
          console.error(`Failed to create notification for ${name}:`, error)
        }
        break // Only create one notification per watcher per evaluation
      }
    }
  }

  // 6. Calculate next evaluation time
  const nextEvalTime = calculateNextEvalTime(expiryTime, now)
  await updateEvalPointer(db, name, nextEvalTime)

  return notificationsCreated
}

/**
 * Calculates the next evaluation time for a name based on its expiry date and thresholds.
 *
 * This function implements smart scheduling:
 * - If name is expired (daysUntilExpiry <= 0), returns null (no more checks needed)
 * - If name is more than 30 days from expiry, schedules check for 30 days before
 * - If name is 7-30 days from expiry, schedules check for 7 days before
 * - If name is 1-7 days from expiry, schedules check for 1 day before
 * - If name is less than 1 day from expiry, checks daily until expiry
 *
 * The minimum check interval is 1 hour to prevent excessive subgraph calls.
 *
 * @param expiryTime - Expiry timestamp in milliseconds
 * @param now - Current timestamp in milliseconds
 * @returns Next evaluation date, or null if name is expired
 */
function calculateNextEvalTime(expiryTime: number, now: number): Date | null {
  const daysUntilExpiry = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry <= 0) {
    return null // Name expired, no need to check again
  }

  // Find the next threshold to check
  let nextThreshold = null
  for (const threshold of THRESHOLDS) {
    if (daysUntilExpiry > threshold) {
      nextThreshold = threshold
      break
    }
  }

  if (!nextThreshold) {
    // All thresholds passed, check daily until expiry
    return new Date(now + 24 * 60 * 60 * 1000) // 1 day from now
  }

  // Schedule next check for the threshold
  const nextCheckTime = expiryTime - nextThreshold * 24 * 60 * 60 * 1000
  return new Date(Math.max(nextCheckTime, now + 60 * 60 * 1000)) // At least 1 hour from now
}

/**
 * Updates or removes the eval pointer for a name.
 *
 * This function manages the eval pointer lifecycle:
 * - If nextEvalAt is null, removes the eval pointer (name expired or no watchers)
 * - If nextEvalAt is provided, updates or creates the eval pointer with the new schedule
 *
 * The function clears the lease_until field to allow the next cron run to process this name.
 *
 * IDEAL SQL QUERIES:
 *
 * For removal (nextEvalAt === null):
 * ```sql
 * DELETE FROM ens_eval_pointers WHERE name = $1;
 * ```
 *
 * For update/insert (nextEvalAt provided):
 * ```sql
 * INSERT INTO ens_eval_pointers (name, next_eval_at, lease_until, updated_at)
 * VALUES ($1, $2, $3, $4)
 * ON CONFLICT (name)
 * DO UPDATE SET
 *   next_eval_at = EXCLUDED.next_eval_at,
 *   lease_until = EXCLUDED.lease_until,
 *   updated_at = EXCLUDED.updated_at;
 * ```
 *
 * @param db - Database connection
 * @param name - ENS name to update
 * @param nextEvalAt - Next evaluation time, or null to remove the pointer
 */
async function updateEvalPointer(
  db: Database,
  name: string,
  nextEvalAt: Date | null,
): Promise<void> {
  if (nextEvalAt === null) {
    // Remove eval pointer
    await db
      .delete(TABLE.ensEvalPointers)
      .where(eq(TABLE.ensEvalPointers.name, name))
  } else {
    // Update or insert eval pointer
    await db
      .insert(TABLE.ensEvalPointers)
      .values({
        name,
        next_eval_at: nextEvalAt,
        lease_until: new Date(0), // Clear lease
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: TABLE.ensEvalPointers.name,
        set: {
          next_eval_at: nextEvalAt,
          lease_until: new Date(0), // Clear lease
          updated_at: new Date(),
        },
      })
  }
}
