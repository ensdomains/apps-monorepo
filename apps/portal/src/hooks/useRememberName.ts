import { useEffect } from 'react'
import { rememberName } from '@/utils/ens/localLabels'
import { isValidEnsName } from '@/utils/token/isNormalized'

/**
 * Remembers an opened name's labels, so a `[labelhash]` row for it elsewhere
 * (a parent's subnames) shows the label. Only normalized spellings are kept.
 */
export const useRememberName = (name: string) => {
  useEffect(() => {
    if (isValidEnsName(name)) rememberName(name)
  }, [name])
}
