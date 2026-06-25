import type { Dispatch, SetStateAction } from 'react'

export type StartUpgradeParams = {
  readonly isUpgradeDisabled: boolean
  readonly onNext: () => boolean | Promise<boolean>
  readonly setIsStarting: Dispatch<SetStateAction<boolean>>
}

export type StartSelectNamesActionParams = {
  readonly isDisabled: boolean
  readonly onRenewGrace: (names: string[]) => boolean | Promise<boolean>
  readonly onUpgrade: () => boolean | Promise<boolean>
  readonly selectedGraceNames: readonly string[]
  readonly setIsStarting: Dispatch<SetStateAction<boolean>>
}

export const startSelectNamesAction = async ({
  isDisabled,
  onRenewGrace,
  onUpgrade,
  selectedGraceNames,
  setIsStarting,
}: StartSelectNamesActionParams) => {
  if (isDisabled) return
  setIsStarting(true)
  try {
    const didStart =
      selectedGraceNames.length > 0
        ? await onRenewGrace([...selectedGraceNames])
        : await onUpgrade()
    if (!didStart) setIsStarting(false)
  } catch (error) {
    setIsStarting(false)
    throw error
  }
}

export const startUpgrade = async ({
  isUpgradeDisabled,
  onNext,
  setIsStarting,
}: StartUpgradeParams) => {
  if (isUpgradeDisabled) return
  setIsStarting(true)
  try {
    const didStart = await onNext()
    if (!didStart) setIsStarting(false)
  } catch (error) {
    setIsStarting(false)
    throw error
  }
}
