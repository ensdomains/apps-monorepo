import { usePrivy } from '@privy-io/react-auth'

// The app's connect entry point. `login()` opens Privy's hosted modal;
// @privy-io/wagmi then syncs the connected wallet into wagmi automatically, so
// there's no manual handoff to manage here. Undefined until Privy is ready,
// which gates the connect buttons.
export const useConnectModal = () => {
  const { ready, login } = usePrivy()
  return { openConnectModal: ready ? login : undefined }
}
