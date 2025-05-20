import { Box, ThemeToggle } from '@ensdomains/thorin'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const { t } = useTranslation()
  return (
    <>
      {t('hello')}
      <ConnectButton />
      <Box width="40">
        <ThemeToggle />
      </Box>
    </>
  )
}
