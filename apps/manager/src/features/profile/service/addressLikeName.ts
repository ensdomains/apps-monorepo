import { getSearchNameKind } from '@/features/search/getSearchNameKind'
import { isAddressLikeLabel } from '@/features/search/isAddressLikeLabel'

/**
 * Whether a .eth 2LD reads like a wallet address, the same names
 * registration refuses. Its profile warns that it may resolve elsewhere.
 */
export const isAddressLikeEthName = (name: string): boolean => {
  const kind = getSearchNameKind(name)
  return kind.type === 'eth-2ld' && isAddressLikeLabel(kind.label)
}
