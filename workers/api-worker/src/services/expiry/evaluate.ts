import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { ok } from 'neverthrow'
import { type Database, intoDbResult, TABLE } from '#core/database/index.js'
import { createBatchNotifications } from '#services/notifications/create.js'
import { getExpiryForNames } from './index.js'

/**
 * Error thrown when eval pointer operations fail.
 */
class EvalPointerError extends TaggedError('EVAL_POINTER_ERROR') {}

/**
 * Error thrown when name update operations fail.
 */
class NameUpdateError extends TaggedError('NAME_UPDATE_ERROR') {}

/**
 * Error thrown for general expiry evaluation errors.
 */
class ExpiryEvaluationError extends TaggedError('EXPIRY_EVALUATION_ERROR') {}

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

/**
 * Leases names that are due for evaluation using database-level locking.
 *
 * This function uses SELECT FOR UPDATE SKIP LOCKED to prevent multiple cron workers
 * from processing the same names simultaneously. It only leases names that:
 * 1. Are due for evaluation (next_eval_at <= now)
 * 2. Are not currently leased by another worker (lease_until IS NULL OR lease_until <= now)
 *
 * The lease prevents other workers from processing the same names for LEASE_DURATION_MINUTES,
 * ensuring that each name is only processed by one worker at a time.
 *
 * @internal - Exported for testing purposes only
 * @param db - Database connection
 * @returns Result containing array of leased names with their evaluation times, or error
 */
export const leaseDueNames = ResultFn(async function* (db: Database) {
  const now = new Date()
  const leaseUntil = new Date(
    now.getTime() + LEASE_DURATION_MINUTES * 60 * 1000,
  )

  // Subquery to filter names due for evaluation and limit the batch size
  // FOR UPDATE SKIP LOCKED ensures we only get names not currently being processed
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

  // Update the eval pointers with the lease until time and the updated at time
  // This "leases" the names to this worker for processing
  const leasedNames = yield* intoDbResult(
    db
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
      }),
  ).mapErr(
    (error) =>
      new EvalPointerError({
        message: 'Failed to lease due names for evaluation',
        cause: error,
      }),
  )

  return ok(leasedNames)
})

/**
 * Gets the next notification threshold that should be checked for a given expiry time.
 *
 * Returns the first threshold where the name is within the threshold window (daysUntilExpiry <= threshold).
 * This determines which notification to send (30 days, 7 days, or 1 day before expiry).
 *
 * @internal - Exported for testing purposes only
 * @param expiryTime - Expiry timestamp in milliseconds
 * @returns The threshold in days, or undefined if no threshold applies
 */
export function getNextThreshold(expiryTime: number): number | undefined {
  const now = Date.now()
  const daysUntilExpiry = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24))
  const validThresholds = THRESHOLDS.filter(
    (threshold) => daysUntilExpiry <= threshold && daysUntilExpiry > 0,
  )

  if (validThresholds.length > 0) {
    return Math.min(...validThresholds)
  }
  return undefined
}

/**
 * Fetches fresh expiry data from the ENS subgraph for a batch of names.
 *
 * This queries the subgraph indexer to get the latest expiry dates and owner information
 * for all requested names. Handles missing names gracefully by logging warnings.
 *
 * @internal - Exported for testing purposes only
 * @param names - Array of ENS names to fetch data for
 * @returns Result containing Map of name -> {expiryDate, owner} for names found in the indexer, or error
 */
export const fetchFreshExpiryData = ResultFn(async function* (names: string[]) {
  // Fetch fresh data from subgraph using ResultFn
  const freshData = yield* getExpiryForNames(names)

  // Log names that were requested but not found in the indexer
  const missingNames = names.filter((name) => !freshData.has(name))
  if (missingNames.length > 0) {
    console.warn(`Names not found in the indexer: ${missingNames.join(', ')}`)
  }

  return ok(freshData)
})

/**
 * Builds notification inputs for batch creation by processing watchers and checking thresholds.
 *
 * This function processes all watchers for the given names, checks if any notification thresholds
 * have been crossed, and builds the notification input array ready for batch creation.
 *
 * @internal - Exported for testing purposes only
 * @param freshData - Map of name -> expiry data from subgraph
 * @param watchers - Array of watchers with user information
 * @returns Array of notification inputs ready for batch creation
 */
export function buildNotificationInputs(
  freshData: Map<string, { expiryDate: Date | null; owner: string | null }>,
  watchers: Array<{
    name: string
    user_id: string
    user: { address: string }
  }>,
): Array<{
  userId: string
  payload: {
    name: string
    expiryDate: number
    isOwner: boolean
  }
  idempotencyKey: string
}> {
  const notificationsToCreate: Array<{
    userId: string
    payload: {
      name: string
      expiryDate: number
      isOwner: boolean
    }
    idempotencyKey: string
  }> = []

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
      // No threshold crossed, skip notification creation
      continue
    }

    notificationsToCreate.push({
      userId: watcher.user_id,
      payload: {
        name: watcher.name,
        expiryDate: nameData.expiryDate.getTime(),
        isOwner: nameData.owner === watcher.user.address,
      },
      idempotencyKey: `name-expiry:${watcher.user_id}:${watcher.name}:${nextThreshold}:${nameData.expiryDate.getTime()}`,
    })
  }

  return notificationsToCreate
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
 * @internal - Exported for testing purposes only
 * @param expiryTime - Expiry timestamp in milliseconds
 * @param now - Current timestamp in milliseconds
 * @returns Next evaluation date, or null if name is expired
 */
export function calculateNextEvalTime(
  expiryTime: number,
  now: number,
): Date | null {
  const daysUntilExpiry = Math.ceil((expiryTime - now) / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry <= 0) {
    return null // Name expired, no more checks needed
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
 * Calculates next evaluation times for multiple names in batch.
 *
 * This processes all names and calculates their next evaluation times based on expiry dates
 * and watcher counts. Handles edge cases like missing expiry dates or expired names.
 *
 * @internal - Exported for testing purposes only
 * @param names - Array of names to calculate eval times for
 * @param freshData - Map of name -> expiry data from subgraph
 * @param watcherCounts - Map of name -> number of watchers
 * @returns Map of name -> nextEvalAt (Date | null)
 */
export function calculateNextEvalTimes(
  names: string[],
  freshData: Map<string, { expiryDate: Date | null; owner: string | null }>,
  watcherCounts: Map<string, number>,
): Map<string, Date | null> {
  const now = Date.now()
  const evalTimes = new Map<string, Date | null>()

  for (const name of names) {
    const nameData = freshData.get(name)
    const watcherCount = watcherCounts.get(name) ?? 0

    // If no watchers, keep eval pointer but log warning for future cleanup
    if (watcherCount === 0) {
      console.warn(
        `Name ${name} has no watchers - keeping eval pointer for stability (future cleanup needed)`,
      )
      // Schedule next check in 24 hours to retry
      evalTimes.set(name, new Date(now + 24 * 60 * 60 * 1000))
      continue
    }

    // If no expiry date, keep eval pointer but log warning for future cleanup
    if (!nameData?.expiryDate) {
      console.warn(
        `Name ${name} has no expiry date - keeping eval pointer for stability (future cleanup needed)`,
      )
      // Schedule next check in 24 hours to retry
      evalTimes.set(name, new Date(now + 24 * 60 * 60 * 1000))
      continue
    }

    // Calculate next eval time based on expiry date
    const expiryTime = nameData.expiryDate.getTime()
    const nextEvalTime = calculateNextEvalTime(expiryTime, now)
    evalTimes.set(name, nextEvalTime)
  }

  return evalTimes
}

/**
 * Batch updates the ens_names table with fresh expiry data.
 *
 * This performs a single database query to update all names' expiry information,
 * minimizing sub-request count. Uses Drizzle's built-in batching which automatically
 * creates a single INSERT ... ON CONFLICT DO UPDATE query with multiple VALUES.
 *
 * @internal - Exported for testing purposes only
 * @param db - Database connection
 * @param freshData - Map of name -> expiry data from subgraph
 * @param names - Array of names to update
 * @returns Result indicating success or error
 */
export const batchUpdateEnsNames = ResultFn(async function* (
  db: Database,
  freshData: Map<string, { expiryDate: Date | null; owner: string | null }>,
  names: string[],
) {
  const now = new Date()

  // Build update values for all names
  const updateValues = names
    .map((name) => {
      const nameData = freshData.get(name)
      if (!nameData) {
        return null
      }

      return {
        name,
        expiry_at: nameData.expiryDate,
        last_checked_at: now,
        updated_at: now,
      }
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)

  if (updateValues.length === 0) {
    return ok(undefined)
  }

  // Batch update all names in a single query
  // Drizzle automatically batches the array into a single INSERT ... VALUES query
  yield* intoDbResult(
    db
      .insert(TABLE.ensNames)
      .values(updateValues)
      .onConflictDoUpdate({
        target: TABLE.ensNames.name,
        set: {
          expiry_at: sql`EXCLUDED.expiry_at`,
          last_checked_at: sql`EXCLUDED.last_checked_at`,
          updated_at: sql`EXCLUDED.updated_at`,
        },
      }),
  ).mapErr(
    (error) =>
      new NameUpdateError({
        message: 'Failed to batch update ens_names',
        cause: error,
      }),
  )

  return ok(undefined)
})

/**
 * Batch updates eval pointers with next evaluation times.
 *
 * This performs a single database query to update all eval pointers, clearing the lease
 * and setting the next evaluation time. Uses Drizzle's built-in batching which automatically
 * creates a single INSERT ... ON CONFLICT DO UPDATE query with multiple VALUES.
 *
 * @internal - Exported for testing purposes only
 * @param db - Database connection
 * @param evalTimes - Map of name -> nextEvalAt (Date | null)
 * @returns Result indicating success or error
 */
export const batchUpdateEvalPointers = ResultFn(async function* (
  db: Database,
  evalTimes: Map<string, Date | null>,
) {
  const now = new Date()
  const updateValues: Array<{
    name: string
    next_eval_at: Date
    lease_until: Date
    updated_at: Date
  }> = []

  // Build update values for all eval pointers
  // Note: We keep eval pointers even for null nextEvalAt (for stability)
  // They will be scheduled for retry in 24 hours
  for (const [name, nextEvalAt] of evalTimes.entries()) {
    // If nextEvalAt is null, schedule retry in 24 hours
    const nextEval = nextEvalAt ?? new Date(now.getTime() + 24 * 60 * 60 * 1000)

    updateValues.push({
      name,
      next_eval_at: nextEval,
      lease_until: new Date(0), // Clear lease to allow next processing
      updated_at: now,
    })
  }

  if (updateValues.length === 0) {
    return ok(undefined)
  }

  // Batch update all eval pointers in a single query
  // Drizzle automatically batches the array into a single INSERT ... VALUES query
  yield* intoDbResult(
    db
      .insert(TABLE.ensEvalPointers)
      .values(updateValues)
      .onConflictDoUpdate({
        target: TABLE.ensEvalPointers.name,
        set: {
          next_eval_at: sql`EXCLUDED.next_eval_at`,
          lease_until: sql`EXCLUDED.lease_until`,
          updated_at: sql`EXCLUDED.updated_at`,
        },
      }),
  ).mapErr(
    (error) =>
      new EvalPointerError({
        message: 'Failed to batch update eval pointers',
        cause: error,
      }),
  )

  return ok(undefined)
})

/**
 * Orchestrates the batch processing of names for expiry evaluation.
 *
 * This function coordinates the entire batch evaluation process:
 * 1. Fetches fresh expiry data from the ENS subgraph
 * 2. Gets all watchers for the names
 * 3. Builds notification inputs for threshold-crossed names
 * 4. Creates notifications in batch
 * 5. Updates ens_names table with fresh data
 * 6. Updates eval pointers with next evaluation times
 *
 * All database operations are batched to minimize sub-request count and stay
 * within Cloudflare's 1,000 sub-request limit.
 *
 * @param env - Cloudflare environment bindings (for notification creation)
 * @param db - Database connection
 * @param names - Array of ENS names to process
 * @returns Result indicating success or error
 */
export const processNames = ResultFn(async function* ({
  env,
  db,
  names,
}: {
  env: CloudflareBindings
  db: Database
  names: string[]
}) {
  if (names.length === 0) {
    return ok(undefined)
  }

  // Step 1: Fetch fresh expiry data from subgraph
  const freshData = yield* fetchFreshExpiryData(names)
  const namesToCheck = names.filter((name) => freshData.has(name))

  if (namesToCheck.length === 0) {
    console.log('No names found in indexer, skipping batch processing')
    return ok(undefined)
  }

  // Step 2: Get all watchers for the names with their user information
  const watchers = yield* intoDbResult(
    db.query.ensWatchers.findMany({
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
    }),
  ).mapErr(
    (error) =>
      new ExpiryEvaluationError({
        message: 'Failed to fetch watchers for names',
        cause: error,
      }),
  )

  // Build watcher counts map for calculating eval times
  const watcherCounts = new Map<string, number>()
  for (const watcher of watchers) {
    watcherCounts.set(watcher.name, (watcherCounts.get(watcher.name) ?? 0) + 1)
  }

  // Step 3: Build notification inputs for names that crossed thresholds
  const notificationsToCreate = buildNotificationInputs(freshData, watchers)

  // Step 4: Create notifications in batch (if any)
  if (notificationsToCreate.length > 0) {
    const result = yield* createBatchNotifications({
      env,
      db,
      kind: 'name-expiry',
      notifications: notificationsToCreate,
    })

    console.log(
      `Created ${result.notificationCount} notifications for ${namesToCheck.length} names`,
      `(${result.deliveryCount} deliveries, ${JSON.stringify(result.queueJobCounts)} queue jobs)`,
    )
  } else {
    console.log('No notifications to create for the given names')
  }

  // Step 5: Batch update ens_names table with fresh expiry data
  yield* batchUpdateEnsNames(db, freshData, namesToCheck)

  // Step 6: Calculate next eval times for all names
  const evalTimes = calculateNextEvalTimes(
    namesToCheck,
    freshData,
    watcherCounts,
  )

  // Step 7: Batch update eval pointers with next evaluation times
  yield* batchUpdateEvalPointers(db, evalTimes)

  console.log(`Completed batch processing for ${namesToCheck.length} names`)

  return ok(undefined)
})

/**
 * Main entry point for the expiry evaluation cron job.
 *
 * This function orchestrates the entire batch expiry checking process:
 * 1. Leases names that are due for evaluation (prevents concurrent processing)
 * 2. Processes the leased names in batch (fetches data, creates notifications, updates pointers)
 *
 * The function is designed to be resilient - if one batch fails, the error is logged
 * but the cron job completes successfully to allow for future retries.
 *
 * @param env - Cloudflare environment bindings (for notification creation)
 * @param db - Database connection for data operations
 * @returns Result indicating success or error
 */
export const evaluateExpiringNames = ResultFn(async function* (
  env: CloudflareBindings,
  db: Database,
) {
  console.log('Starting expiry evaluation cron job')

  // Step 1: Lease due names from eval pointers
  // This uses database-level locking to prevent concurrent processing
  const leasedNames = yield* leaseDueNames(db)
  console.log(`Leased ${leasedNames.length} names for evaluation`)

  if (leasedNames.length === 0) {
    console.log('No names due for evaluation')
    return ok(undefined)
  }

  // Step 2: Process all leased names in batch
  // This handles fetching fresh data, creating notifications, and updating eval pointers
  const namesToProcess = leasedNames.map((pointer) => pointer.name)
  yield* processNames({
    env,
    db,
    names: namesToProcess,
  })

  console.log('Expiry evaluation cron job completed successfully')
  return ok(undefined)
})
