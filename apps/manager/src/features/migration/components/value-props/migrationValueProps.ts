import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import customProfiles from './assets/custom-profiles.webp'
import everythingOnePlace from './assets/everything-one-place.webp'
import favoritesAnimation from './assets/favorites.webm'
import favorites from './assets/favorites.webp'
import notificationsAnimation from './assets/notifications.webm'
import personalizedNft from './assets/personalized-nft.webp'
import type { MigrationValuePropMedia } from './MigrationValuePropMediaCard'

export type MigrationValuePropSlide = {
  readonly id: 'profiles' | 'favorites' | 'notifications' | 'experience' | 'nft'
  readonly label: MessageDescriptor
  readonly media: MigrationValuePropMedia
}

// Replace these with final `.webp` / `.webm` imports as assets land.
// Example:
// import customProfilesCard from './assets/custom-profiles-card.webp'
// import favoritesCardAnimation from './assets/favorites-card.webm'
export const MIGRATION_VALUE_PROP_SLIDES: readonly MigrationValuePropSlide[] = [
  {
    id: 'profiles',
    label: msg`Custom profiles`,
    media: {
      alt: 'Custom profiles placeholder card',
      src: customProfiles,
      type: 'image',
    },
  },
  {
    id: 'favorites',
    label: msg`Track your favorite names`,
    media: {
      alt: 'Track your favorite names placeholder animation',
      poster: favorites,
      src: favoritesAnimation,
      type: 'video',
    },
  },
  {
    id: 'notifications',
    label: msg`Keep your names safe with notifications`,
    media: {
      alt: 'Notifications placeholder animation',
      src: notificationsAnimation,
      type: 'video',
    },
  },
  {
    id: 'experience',
    label: msg`Manage everything in one place`,
    media: {
      alt: 'Manage everything in one place placeholder card',
      src: everythingOnePlace,
      type: 'image',
    },
  },
  {
    id: 'nft',
    label: msg`Personalized NFT`,
    media: {
      alt: 'Personalized NFT placeholder card',
      src: personalizedNft,
      type: 'image',
    },
  },
] as const
