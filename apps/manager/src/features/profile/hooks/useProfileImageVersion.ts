import { useQuery } from '@tanstack/react-query'
import {
  profileImageVersionQuery,
  type SignedProfileImageUpload,
} from '@/features/profile/service/profileImageCache'

interface UseProfileImageVersionParams {
  readonly kind: SignedProfileImageUpload['kind']
  readonly name?: string | null
}

export const useProfileImageVersion = ({
  kind,
  name,
}: UseProfileImageVersionParams) => {
  const query = useQuery(profileImageVersionQuery({ kind, name: name ?? '' }))

  return name ? query.data : undefined
}
