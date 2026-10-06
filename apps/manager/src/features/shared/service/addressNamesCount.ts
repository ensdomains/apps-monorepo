import {
  type AuthorityRelationParam,
  isBignameError,
  type ListAddressNamesParams,
  type RequestOptions,
} from '@ens-apps/bigname'
import { bigname } from '@/lib/bigname'

/** How long the exact count of an address above bigname's candidate cap may take. */
export const EXACT_COUNT_TIMEOUT_MS = 10_000

/**
 * The filters of an address-names count. Only the ownership relations are
 * counted: `resolves_to` and `former_owner` always answer `total_count: null`
 * and reject `include=total_count`.
 */
export type AddressNamesCountParams = Omit<
  ListAddressNamesParams,
  'relation' | 'include' | 'cursor' | 'page_size'
> & {
  readonly relation?: AuthorityRelationParam
}

/**
 * The exact count, asked for with `include=total_count`, or `null` when
 * bigname cannot give it: the read reached bigname's deadline
 * (`408 request_timeout`, which the client has already retried) or ours.
 */
const readExactCount = async (
  address: string,
  params: AddressNamesCountParams,
  options: RequestOptions,
): Promise<number | null> => {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), EXACT_COUNT_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      bigname
        .listAddressNames(
          address,
          { ...params, page_size: 1, include: ['total_count'] },
          { signal: controller.signal },
        )
        .then(
          ({ data, page }) =>
            page.total_count ??
            (data.length === 0 && !page.has_more ? 0 : null),
        ),
      timedOut,
    ])
  } catch (error) {
    if (isBignameError(error, 'request_timeout')) {
      return null
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromCaller)
    // A count nobody waits for any more must not keep reading candidates.
    controller.abort()
  }
}

/** Exact ownership count from the target BigName contract, in one request. */
export const getAddressNamesCount = (
  address: string,
  params: AddressNamesCountParams,
  options: RequestOptions = {},
): Promise<number | null> => readExactCount(address, params, options)
