import { assign, setup } from 'xstate'

// Types for better type safety
export interface NFT {
  readonly id: string
  readonly name: string
  readonly image: string
  readonly collection: string
  readonly avatarRecord: string
}

export interface ImageSelectionContext {
  // Input callbacks
  onImageChange: (url: string) => void
  onImageRemove: () => void

  // Form data
  manualUrl: string
  searchQuery: string

  // Selection state
  selectedNFT: NFT | null
  uploadedImage: string | null

  // Data
  nfts: NFT[]
  filteredNFTs: NFT[]

  // UI state
  error: string | null
}

const initialContext: Omit<
  ImageSelectionContext,
  'onImageChange' | 'onImageRemove'
> = {
  manualUrl: '',
  searchQuery: '',
  selectedNFT: null,
  uploadedImage: null,
  nfts: [],
  filteredNFTs: [],
  error: null,
}

export const imageSelectionMachine = setup({
  types: {
    context: {} as ImageSelectionContext,
    events: {} as
      | { type: 'RESET' }
      | { type: 'OPEN_NFT_SELECTION' }
      | { type: 'OPEN_UPLOAD'; imageUrl: string }
      | { type: 'OPEN_MANUAL_INPUT' }
      | { type: 'OPEN_REMOVE_CONFIRMATION' }
      | { type: 'CANCEL' }
      | { type: 'BACK' }
      | { type: 'CONFIRM_REMOVAL' }
      | { type: 'SELECT_NFT'; nft: NFT }
      | { type: 'CONFIRM_NFT' }
      | { type: 'CONFIRM_UPLOAD' }
      | { type: 'UPDATE_MANUAL_URL'; url: string }
      | { type: 'PREVIEW_MANUAL_URL' }
      | { type: 'CONFIRM_MANUAL_URL' }
      | { type: 'UPDATE_SEARCH_QUERY'; query: string }
      | { type: 'SET_NFTS'; nfts: NFT[] }
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

    assignSearchQuery: assign({
      searchQuery: ({ event }) => {
        if (event.type === 'UPDATE_SEARCH_QUERY') return event.query
        return ''
      },
    }),

    assignSelectedNFT: assign({
      selectedNFT: ({ event }) => {
        if (event.type === 'SELECT_NFT') return event.nft
        return null
      },
    }),

    assignUploadedImage: assign({
      uploadedImage: ({ event }) => {
        if (event.type === 'OPEN_UPLOAD') return event.imageUrl
        return null
      },
    }),

    assignNFTs: assign({
      nfts: ({ context, event }) => {
        if (event.type !== 'SET_NFTS') return context.nfts
        return event.nfts
      },
      filteredNFTs: ({ context, event }) => {
        if (event.type !== 'SET_NFTS') return context.filteredNFTs

        const query = context.searchQuery.trim().toLowerCase()
        if (!query) return event.nfts

        return event.nfts.filter(
          (nft) =>
            nft.name.toLowerCase().includes(query) ||
            nft.collection.toLowerCase().includes(query),
        )
      },
    }),

    updateFilteredNFTs: assign({
      filteredNFTs: ({ context, event }) => {
        const query =
          event.type === 'UPDATE_SEARCH_QUERY'
            ? event.query.trim().toLowerCase()
            : context.searchQuery.trim().toLowerCase()

        if (!query) return context.nfts

        return context.nfts.filter(
          (nft) =>
            nft.name.toLowerCase().includes(query) ||
            nft.collection.toLowerCase().includes(query),
        )
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

    handleNFTSelection: ({ context }) => {
      if (context.selectedNFT) {
        context.onImageChange(context.selectedNFT.avatarRecord)
      }
    },

    handleUploadConfirmation: ({ context }) => {
      if (context.uploadedImage) {
        context.onImageChange(context.uploadedImage)
      }
    },

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

    hasSelectedNFT: ({ context }) => context.selectedNFT !== null,

    hasUploadedImage: ({ context }) => context.uploadedImage !== null,
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
    SET_NFTS: {
      actions: 'assignNFTs',
    },
  },
  states: {
    main: {
      on: {
        OPEN_NFT_SELECTION: 'nftSelection',
        OPEN_UPLOAD: 'uploadPreview',
        OPEN_MANUAL_INPUT: 'manualInput',
        OPEN_REMOVE_CONFIRMATION: 'removeConfirmation',
      },
    },

    nftSelection: {
      initial: 'browsing',
      on: {
        CANCEL: 'main',
        BACK: 'main',
      },
      states: {
        browsing: {
          on: {
            UPDATE_SEARCH_QUERY: {
              actions: ['assignSearchQuery', 'updateFilteredNFTs'],
            },
            SELECT_NFT: {
              target: 'confirming',
              actions: 'assignSelectedNFT',
            },
          },
        },
        confirming: {
          on: {
            CONFIRM_NFT: [
              {
                guard: 'hasSelectedNFT',
                actions: 'handleNFTSelection',
                target: '#imageSelection.main',
              },
              {
                actions: 'setError',
              },
            ],
            BACK: 'browsing',
          },
        },
      },
    },

    uploadPreview: {
      on: {
        CANCEL: 'main',
        BACK: 'main',
        CONFIRM_UPLOAD: [
          {
            guard: 'hasUploadedImage',
            actions: 'handleUploadConfirmation',
            target: 'main',
          },
          {
            actions: 'setError',
          },
        ],
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
