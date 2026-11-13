import { normalize } from 'viem/ens'

/** Use the operation's name; invalid or absent input must not affect product work. */
export const getAnalyticsNameProperties = (
  name: string | undefined,
): { readonly ens_name?: string } => {
  if (!name) return {}
  try {
    return { ens_name: normalize(name) }
  } catch {
    return {}
  }
}
