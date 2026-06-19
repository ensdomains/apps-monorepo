import { usePrivy } from '@privy-io/react-auth'

// The app's connect entry point. `login()` opens Privy's hosted modal;
// @privy-io/wagmi then syncs the connected wallet into wagmi automatically, so
// there's no manual handoff to manage here. `ready` is the wallet layer's
// initialisation signal (the Header gates its connect slot on it); when not
// ready, `openConnectModal` is undefined so the connect buttons stay disabled.
export const useConnectModal = () => {
  const { ready, login } = usePrivy()
  return { ready, openConnectModal: ready ? login : undefined }
}
