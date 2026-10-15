import { createContext, use } from 'react'
import type { ProfileRecords } from '@/features/profile/types'

export interface ProfileDraft {
  readonly avatarPreviewUrl?: string
  readonly headerPreviewUrl?: string
  readonly records: ProfileRecords
}

type SetProfileDraft = (draft: ProfileDraft | null) => void

const ProfileDraftContext = createContext<SetProfileDraft>(() => {})

export const ProfileDraftProvider = ProfileDraftContext.Provider

export const useSetProfileDraft = () => use(ProfileDraftContext)
