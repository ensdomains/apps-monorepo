import { msg } from '@lingui/core/macro'
import { match } from 'ts-pattern'

export const favoriteAuthPromptMessage = msg`Connect to favorite name`

type FavoriteActionIntentArgs = {
  readonly isAuthed: boolean
  readonly isFavorite: boolean
  readonly isPending: boolean
  readonly name: string
  readonly shouldPromptAuth: boolean
}

export type FavoriteActionIntent =
  | {
      readonly kind: 'addFavorite'
      readonly name: string
    }
  | {
      readonly kind: 'removeFavorite'
      readonly name: string
    }
  | {
      readonly kind: 'promptAuth'
    }
  | {
      readonly kind: 'none'
    }

export const getFavoriteActionIntent = ({
  isAuthed,
  isFavorite,
  isPending,
  name,
  shouldPromptAuth,
}: FavoriteActionIntentArgs): FavoriteActionIntent => {
  if (isPending) return { kind: 'none' }
  if (!isAuthed)
    return shouldPromptAuth ? { kind: 'promptAuth' } : { kind: 'none' }
  if (isFavorite) return { kind: 'removeFavorite', name }

  return { kind: 'addFavorite', name }
}

export const getFavoriteActionDisabled = ({
  isPending,
}: {
  readonly isPending: boolean
}) => isPending

export type ProfileFavoriteIntent =
  | Extract<
      FavoriteActionIntent,
      { readonly kind: 'addFavorite' | 'removeFavorite' | 'none' }
    >
  | { readonly kind: 'connectWallet' }
  | { readonly kind: 'signIn' }

/** The profile's favorite asks for a wallet, then a sign-in, before it can save. */
export const getProfileFavoriteIntent = ({
  isAuthed,
  isConnected,
  isFavorite,
  isPending,
  name,
}: {
  readonly isAuthed: boolean
  readonly isConnected: boolean
  readonly isFavorite: boolean
  readonly isPending: boolean
  readonly name: string
}): ProfileFavoriteIntent =>
  match({ isAuthed, isConnected, isFavorite, isPending })
    .returnType<ProfileFavoriteIntent>()
    .with({ isPending: true }, () => ({ kind: 'none' }))
    .with({ isConnected: false }, () => ({ kind: 'connectWallet' }))
    .with({ isAuthed: false }, () => ({ kind: 'signIn' }))
    .with({ isFavorite: true }, () => ({ kind: 'removeFavorite', name }))
    .otherwise(() => ({ kind: 'addFavorite', name }))
