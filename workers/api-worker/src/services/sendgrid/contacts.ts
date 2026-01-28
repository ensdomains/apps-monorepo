import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { fromPromise, ok } from 'neverthrow'
import * as v from 'valibot'
import { createIntoError, error } from '#utils/result.js'
import { parseIntoResult } from '#utils/validation.js'

const BASE_URL = 'https://api.sendgrid.com'

// Errors
export class SendGridContactsError extends TaggedError(
  'SENDGRID_CONTACTS_ERROR',
) {}

// Response schemas
const AddContactsResponseSchema = v.object({
  job_id: v.string(),
})

const SearchContactsResponseSchema = v.object({
  result: v.array(
    v.object({
      id: v.string(),
      email: v.string(),
      list_ids: v.optional(v.array(v.string())),
    }),
  ),
  contact_count: v.number(),
})

const SendGridErrorResponseSchema = v.object({
  errors: v.optional(
    v.array(
      v.object({
        message: v.string(),
        field: v.optional(v.string()),
      }),
    ),
  ),
})

type SendGridEnv = {
  SENDGRID_API_KEY: string
  SENDGRID_BROADCAST_LIST_ID: string
}

/**
 * add a contact to the broadcast list.
 * SendGrid processes this async and returns a job_id.
 */
export const addContactToList = ResultFn(async function* (
  env: SendGridEnv,
  email: string,
  userId?: string,
) {
  const url = new URL(`${BASE_URL}/v3/marketing/contacts`)

  const response = yield* fromPromise(
    fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        list_ids: [env.SENDGRID_BROADCAST_LIST_ID],
        contacts: [
          {
            email,
            ...(userId && { custom_fields: { user_id: userId } }),
          },
        ],
      }),
    }),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )

  if (response.status === 202) {
    const json = yield* fromPromise(
      response.json(),
      createIntoError('SENDGRID_CONTACTS_ERROR'),
    )
    const parsed = yield* parseIntoResult(AddContactsResponseSchema, json, {
      code: 'SENDGRID_CONTACTS_ERROR',
      message: 'Failed to parse add contacts response',
    })
    return ok({ jobId: parsed.job_id })
  }

  // parse error
  const json = yield* fromPromise(
    response.json(),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )
  const parsed = yield* parseIntoResult(SendGridErrorResponseSchema, json, {
    code: 'SENDGRID_CONTACTS_ERROR',
    message: 'Failed to parse error response',
  })

  return error({
    code: 'SENDGRID_CONTACTS_ERROR',
    message: parsed.errors?.[0]?.message ?? `Status ${response.status}`,
    statusCode: response.status,
  })
})

/**
 * search for a contact by email to get their ID.
 */
export const searchContact = ResultFn(async function* (
  env: SendGridEnv,
  email: string,
) {
  const url = new URL(`${BASE_URL}/v3/marketing/contacts/search`)

  const response = yield* fromPromise(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        query: `email = '${email}'`,
      }),
    }),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )

  if (response.status === 200) {
    const json = yield* fromPromise(
      response.json(),
      createIntoError('SENDGRID_CONTACTS_ERROR'),
    )
    const parsed = yield* parseIntoResult(SearchContactsResponseSchema, json, {
      code: 'SENDGRID_CONTACTS_ERROR',
      message: 'Failed to parse search response',
    })

    if (parsed.contact_count === 0) {
      return ok(null)
    }

    return ok({
      id: parsed.result[0].id,
      email: parsed.result[0].email,
      listIds: parsed.result[0].list_ids ?? [],
    })
  }

  const json = yield* fromPromise(
    response.json(),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )
  const parsed = yield* parseIntoResult(SendGridErrorResponseSchema, json, {
    code: 'SENDGRID_CONTACTS_ERROR',
    message: 'Failed to parse error response',
  })

  return error({
    code: 'SENDGRID_CONTACTS_ERROR',
    message: parsed.errors?.[0]?.message ?? `Status ${response.status}`,
    statusCode: response.status,
  })
})

/**
 * remove a contact from the broadcast list (this wont delete the contact).
 */
export const removeContactFromList = ResultFn(async function* (
  env: SendGridEnv,
  contactId: string,
) {
  const url = new URL(
    `${BASE_URL}/v3/marketing/lists/${env.SENDGRID_BROADCAST_LIST_ID}/contacts`,
  )
  url.searchParams.set('contact_ids', contactId)

  const response = yield* fromPromise(
    fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
    }),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )

  // 202 = accepted for processing, 200 = success
  if (response.status === 202 || response.status === 200) {
    return ok(undefined)
  }

  const json = yield* fromPromise(
    response.json(),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )
  const parsed = yield* parseIntoResult(SendGridErrorResponseSchema, json, {
    code: 'SENDGRID_CONTACTS_ERROR',
    message: 'Failed to parse error response',
  })

  return error({
    code: 'SENDGRID_CONTACTS_ERROR',
    message: parsed.errors?.[0]?.message ?? `Status ${response.status}`,
    statusCode: response.status,
  })
})

/**
 * delete a contact entirely from SendGrid.
 * note: use when user deletes email channel
 */
export const deleteContact = ResultFn(async function* (
  env: SendGridEnv,
  contactId: string,
) {
  const url = new URL(`${BASE_URL}/v3/marketing/contacts`)
  url.searchParams.set('ids', contactId)

  const response = yield* fromPromise(
    fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
      },
    }),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )

  if (response.status === 202 || response.status === 200) {
    return ok(undefined)
  }

  const json = yield* fromPromise(
    response.json(),
    createIntoError('SENDGRID_CONTACTS_ERROR'),
  )
  const parsed = yield* parseIntoResult(SendGridErrorResponseSchema, json, {
    code: 'SENDGRID_CONTACTS_ERROR',
    message: 'Failed to parse error response',
  })

  return error({
    code: 'SENDGRID_CONTACTS_ERROR',
    message: parsed.errors?.[0]?.message ?? `Status ${response.status}`,
    statusCode: response.status,
  })
})
