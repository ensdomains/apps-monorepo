import { Registration } from '@/features/searchName/RegistrationName'
import {
  Box,
  Heading,
  Typography,
  ThemeToggle,
  Dropdown,
  Button,
} from '@ensdomains/thorin'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  return (
    <>
      <Box
        as="nav"
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        paddingX="6"

        backgroundColor="background"
      >
        <Box display="flex" alignItems="center" gap="3" paddingY="2">
          <Box
            as="img"
            src="/ens-logo.svg"
            alt="ENS Logo"
            width="30"
            height="20"
          />
          <Typography color="textSecondary">v2</Typography>
        </Box>

        <Box display="flex" alignItems="center" gap="3">

          <Dropdown
            items={[
              <ThemeToggle />
            ]}
            label="Theme"
            align="right"
          >
            <Button backgroundColor="transparent" size="small" width="fit" borderColor="accent">
              <Box
                as="img"
                src="/icons/theme.svg"
                alt="Theme"
                width="5"
                height="5"
                style={{
                  filter: 'var(--theme-filter)',
                  opacity: 0.8
                }}
              />
            </Button>
          </Dropdown>
          <ConnectButton />
        </Box>
      </Box>
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height="60vh"
      >
        <Heading level="1" color="blue" style={{ marginBottom: '16px' }}>
          Your web3 username
        </Heading>
        <Typography
          color="textSecondary"
          style={{ marginBottom: '40px', textAlign: 'center', maxWidth: '500px' }}
        >
          Your identity across web3, one name for all your crypto addresses,{' '}
          <br />
          and your decentralised website.
        </Typography>


        <Registration />
      </Box>
    </>
  )
}