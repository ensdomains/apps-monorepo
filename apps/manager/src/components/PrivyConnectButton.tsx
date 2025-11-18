'use client'

import { usePrivy } from '@privy-io/react-auth'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PrivyConnectButton = () => {
  const { ready, authenticated, login, logout, user } = usePrivy()

  // Show loading state while Privy initializes
  if (!ready) {
    return (
      <Button disabled>
        <Loader2 className="size-4 animate-spin" />
        Loading...
      </Button>
    )
  }

  // Show logout button if authenticated
  if (authenticated && user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-600 text-sm">
          {user.email?.address || user.wallet?.address}
        </span>
        <Button variant="outline" onClick={logout}>
          Disconnect
        </Button>
      </div>
    )
  }

  // Show connect button if not authenticated
  return <Button onClick={login}>Connect Wallet</Button>
}
