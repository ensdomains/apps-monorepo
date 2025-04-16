import { Box, ThemeToggle } from '@ensdomains/thorin'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  return (
    <>
      <ConnectButton />
      <Box width="40">
        <ThemeToggle />
      </Box>
    </>
  )
}
