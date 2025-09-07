# WalletKit

A custom wallet connection kit that provides a clean, modern authentication modal for connecting to various wallets and services.

## Structure

```
walletKit/
├── components/
│   ├── AuthModal.tsx           # Main authentication modal
│   ├── ParaAuthComponent.tsx   # Para-specific authentication component
│   └── ConnectWalletButton.tsx # Example usage component
├── connectors/
│   ├── index.ts               # Connector exports
│   └── paraConnector.ts       # Custom Para connector
├── hooks/
│   └── useAuthModal.ts        # Modal state management hook
├── wagmiConfig.ts             # Wagmi configuration
├── index.ts                   # Main exports
└── README.md                  # This file
```

## Features

- **Custom Auth Modal**: Modern, dark-themed modal matching the design in the image
- **Wallet Support**: MetaMask, WalletConnect, and custom Para connector
- **Para Integration**: Email/social authentication through Para service
- **Responsive Design**: Clean UI with proper accessibility
- **TypeScript**: Full type safety throughout

## Usage

### Basic Usage

```tsx
import { AuthModal, useAuthModal } from '@/lib/walletKit'

function MyComponent() {
  const { isOpen, openModal, closeModal } = useAuthModal()

  return (
    <>
      <button onClick={openModal}>Connect Wallet</button>
      <AuthModal isOpen={isOpen} onClose={closeModal} />
    </>
  )
}
```

### Using the Connect Button

```tsx
import { ConnectWalletButton } from '@/lib/walletKit/components/ConnectWalletButton'

function MyComponent() {
  return <ConnectWalletButton />
}
```

## Components

### AuthModal

The main authentication modal that displays:
- Popular wallet options (MetaMask, WalletConnect)
- Search functionality for wallets
- Para authentication section with email/social login
- Terms of service and privacy policy links

### ParaAuthComponent

Handles Para-specific authentication:
- Email input and verification
- Social login options (Google, Twitter, Discord, Apple)
- Integration with Para service for authentication flow

### useAuthModal

Hook for managing modal state:
- `isOpen`: Current modal state
- `openModal()`: Open the modal
- `closeModal()`: Close the modal

## Configuration

The walletKit uses environment variables:
- `VITE_PARA_API_KEY`: Para service API key
- `VITE_WALLETCONNECT_PROJECT_ID`: WalletConnect project ID

## Customization

You can easily customize the modal by:
1. Adding new wallet connectors in `connectors/index.ts`
2. Modifying the wallet options in `AuthModal.tsx`
3. Customizing the Para authentication flow in `ParaAuthComponent.tsx`
4. Updating the styling and theme in the component files
