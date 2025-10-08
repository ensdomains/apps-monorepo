import { ens_normalize } from '@adraffy/ens-normalize'

export const isNormalized = (name: string) => {
  try {
    return ens_normalize(name) === name
  } catch {
    return false
  }
}
