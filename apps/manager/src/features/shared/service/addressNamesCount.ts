import {
  type AuthorityRelationParam,
  isBignameError,
  isUnsupportedIncludeError,
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
        .then(({ page }) => page.total_count),
      timedOut,
    ])
  } catch (error) {
    if (
      isBignameError(error, 'request_timeout') ||
      isUnsupportedIncludeError(error, 'total_count')
    ) {
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

/**
 * How many names an address-names ownership collection holds, read from one
 * row's `page.total_count`.
 *
 * bigname v0.4.1 always counts exactly. Later releases answer
 * `total_count: null` for an address with more than 1,000 candidate names
 * (counted before the filters, so the filtered collection can still be
 * small). An empty page is then a count of zero; otherwise the read is
 * repeated with `include=total_count`. The flag is never sent first, because
 * v0.4.1 rejects it with a 400, and the first read costs nothing extra there.
 *
 * The exact count reads every candidate and can time out on an address with
 * tens of thousands of names. The result is then `null`: the collection is
 * not empty, and its size is unknown. Callers must not show that as zero.
 * Any other failure rejects with `BignameError`.
 */
export const getAddressNamesCount = async (
  address: string,
  params: AddressNamesCountParams,
  options: RequestOptions = {},
): Promise<number | null> => {
  const first = await bigname.listAddressNames(
    address,
    { ...params, page_size: 1 },
    options,
  )
  if (first.page.total_count !== null) return first.page.total_count
  if (first.data.length === 0 && !first.page.has_more) return 0
  return readExactCount(address, params, options)
}
