import { describe, expect, it } from 'vitest'
import {
  favoriteAuthPromptMessage,
  getFavoriteActionDisabled,
  getFavoriteActionIntent,
  getProfileFavoriteIntent,
} from './favoriteAction.helpers'

describe('favoriteAction.helpers', () => {
  describe('getFavoriteActionIntent', () => {
    it('prompts authentication for unauthenticated mobile favorite taps', () => {
      const result = getFavoriteActionIntent({
        isAuthed: false,
        isFavorite: false,
        isPending: false,
        name: 'nick.eth',
        shouldPromptAuth: true,
      })

      expect(result).toEqual({ kind: 'promptAuth' })
    })

    it('does nothing for unauthenticated desktop clicks because the tooltip handles the prompt', () => {
      const result = getFavoriteActionIntent({
        isAuthed: false,
        isFavorite: false,
        isPending: false,
        name: 'nick.eth',
        shouldPromptAuth: false,
      })

      expect(result).toEqual({ kind: 'none' })
    })

    it('adds the favorite when authenticated and not already favorited', () => {
      const result = getFavoriteActionIntent({
        isAuthed: true,
        isFavorite: false,
        isPending: false,
        name: 'nick.eth',
        shouldPromptAuth: true,
      })

      expect(result).toEqual({ kind: 'addFavorite', name: 'nick.eth' })
    })

    it('removes the favorite when authenticated and already favorited', () => {
      const result = getFavoriteActionIntent({
        isAuthed: true,
        isFavorite: true,
        isPending: false,
        name: 'nick.eth',
        shouldPromptAuth: true,
      })

      expect(result).toEqual({ kind: 'removeFavorite', name: 'nick.eth' })
    })

    it('does nothing while a favorite mutation is pending', () => {
      const result = getFavoriteActionIntent({
        isAuthed: true,
        isFavorite: false,
        isPending: true,
        name: 'nick.eth',
        shouldPromptAuth: true,
      })

      expect(result).toEqual({ kind: 'none' })
    })
  })

  describe('getFavoriteActionDisabled', () => {
    it('keeps unauthenticated favorite actions clickable so mobile can show the auth toast', () => {
      expect(getFavoriteActionDisabled({ isPending: false })).toBe(false)
    })

    it('disables the favorite action while a mutation is pending', () => {
      expect(getFavoriteActionDisabled({ isPending: true })).toBe(true)
    })
  })

  it('uses the requested authentication prompt copy', () => {
    expect(favoriteAuthPromptMessage.message).toBe('Connect to favorite name')
  })
})

describe('getProfileFavoriteIntent', () => {
  const intent = (
    overrides: Partial<Parameters<typeof getProfileFavoriteIntent>[0]>,
  ) =>
    getProfileFavoriteIntent({
      isAuthed: true,
      isConnected: true,
      isFavorite: false,
      isPending: false,
      name: 'nick.eth',
      ...overrides,
    })

  it.each([
    [
      'asks for a wallet when none is connected',
      { isConnected: false, isAuthed: false },
      { kind: 'connectWallet' },
    ],
    [
      'asks a connected wallet to sign in',
      { isAuthed: false },
      { kind: 'signIn' },
    ],
    [
      'adds the name once signed in',
      {},
      { kind: 'addFavorite', name: 'nick.eth' },
    ],
    [
      'removes a favorited name',
      { isFavorite: true },
      { kind: 'removeFavorite', name: 'nick.eth' },
    ],
    [
      'waits while a change is saving',
      { isPending: true, isConnected: false },
      { kind: 'none' },
    ],
  ] as const)('%s', (_, overrides, expected) => {
    expect(intent(overrides)).toEqual(expected)
  })
})
