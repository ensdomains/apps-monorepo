import { Button } from '@ensdomains/thorin'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  return (
    <>
      <ConnectButton />
      <Button width="max">this is thorin</Button>
    </>
  )
}
