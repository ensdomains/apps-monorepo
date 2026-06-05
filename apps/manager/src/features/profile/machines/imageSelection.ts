import { assign, setup } from 'xstate'

export interface ImageSelectionContext {
  onImageChange: (url: string) => void
  onImageRemove: () => void

  manualUrl: string
  error: string | null
}

const initialContext: Omit<
  ImageSelectionContext,
  'onImageChange' | 'onImageRemove'
> = {
  manualUrl: '',
  error: null,
}

export const imageSelectionMachine = setup({
  types: {
    context: {} as ImageSelectionContext,
    events: {} as
      | { type: 'RESET' }
      | { type: 'OPEN_UPLOAD' }
      | { type: 'OPEN_MANUAL_INPUT' }
      | { type: 'OPEN_REMOVE_CONFIRMATION' }
      | { type: 'CANCEL' }
      | { type: 'BACK' }
      | { type: 'CONFIRM_REMOVAL' }
      | { type: 'UPDATE_MANUAL_URL'; url: string }
      | { type: 'PREVIEW_MANUAL_URL' }
      | { type: 'CONFIRM_MANUAL_URL' }
      | { type: 'SET_ERROR'; error: string }
      | { type: 'CLEAR_ERROR' },
    input: {} as {
      onImageChange: (url: string) => void
      onImageRemove: () => void
    },
  },
  actions: {
    resetContext: assign({
      ...initialContext,
    }),

    assignManualUrl: assign({
      manualUrl: ({ event }) => {
        if (event.type === 'UPDATE_MANUAL_URL') return event.url
        return ''
      },
    }),

    setError: assign({
      error: ({ event }) => {
        if (event.type === 'SET_ERROR') return event.error
        return 'An error occurred'
      },
    }),

    clearError: assign({
      error: null,
    }),

    setInvalidUrlError: assign({
      error: ({ context }) => {
        const url = context.manualUrl.trim()
        if (!url) return 'Please enter a URL'

        try {
          new URL(url)
          return 'Please enter a valid image URL'
        } catch {
          return 'Please enter a valid URL format (e.g., https://example.com/image.jpg)'
        }
      },
    }),

    handleManualUrlConfirmation: ({ context }) => {
      if (context.manualUrl.trim()) {
        context.onImageChange(context.manualUrl.trim())
      }
    },

    handleImageRemoval: ({ context }) => {
      context.onImageRemove()
    },
  },
  guards: {
    isManualUrlValid: ({ context }) => {
      const url = context.manualUrl.trim()
      if (!url) return false

      try {
        const parsedUrl = new URL(url)
        // Check if it's a valid HTTP/HTTPS URL
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return false
        }
        return true
      } catch {
        return false
      }
    },
  },
}).createMachine({
  context: ({ input }) => ({
    ...initialContext,
    ...input,
  }),
  id: 'imageSelection',
  initial: 'main',
  on: {
    RESET: {
      target: '.main',
      actions: ['resetContext', 'clearError'],
    },
    SET_ERROR: {
      actions: 'setError',
    },
    CLEAR_ERROR: {
      actions: 'clearError',
    },
  },
  states: {
    main: {
      on: {
        OPEN_UPLOAD: 'uploadPreview',
        OPEN_MANUAL_INPUT: 'manualInput',
        OPEN_REMOVE_CONFIRMATION: 'removeConfirmation',
      },
    },

    uploadPreview: {
      on: {
        CANCEL: 'main',
        BACK: 'main',
      },
    },

    manualInput: {
      initial: 'entering',
      on: {
        CANCEL: 'main',
        BACK: 'main',
      },
      states: {
        entering: {
          on: {
            UPDATE_MANUAL_URL: {
              actions: ['assignManualUrl', 'clearError'],
            },
            PREVIEW_MANUAL_URL: [
              {
                guard: 'isManualUrlValid',
                target: 'previewing',
              },
              {
                actions: 'setInvalidUrlError',
              },
            ],
          },
        },
        previewing: {
          on: {
            CONFIRM_MANUAL_URL: {
              actions: 'handleManualUrlConfirmation',
              target: '#imageSelection.main',
            },
            BACK: 'entering',
          },
        },
      },
    },

    removeConfirmation: {
      on: {
        CANCEL: 'main',
        BACK: 'main',
        CONFIRM_REMOVAL: {
          actions: 'handleImageRemoval',
          target: 'main',
        },
      },
    },
  },
})
