import { createFileRoute } from '@tanstack/react-router'
import { MobileHeader } from '@/components/MobileHeader'
import { PageContainer } from '@/components/PageContainer'
import { RegisterSidebar } from '@/components/RegisterSidebar'
import { SepoliaNoticeBanner } from '@/components/SepoliaNoticeBanner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import {
  DnsImportFlow,
  type DnsImportSearch,
} from '@/features/dns-import/components/DnsImportFlow'

const DnsImportPage = () => {
  const { name } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <SidebarProvider>
      <RegisterSidebar />
      <SidebarInset className="w-full min-w-0">
        <MobileHeader />
        <SepoliaNoticeBanner />
        <PageContainer className="min-h-screen flex flex-col pt-4">
          <DnsImportFlow
            name={name}
            search={search}
            onSearchChange={(patch) =>
              void navigate({
                search: (prev) => ({ ...prev, ...patch }),
              })
            }
          />
        </PageContainer>
      </SidebarInset>
    </SidebarProvider>
  )
}

export const Route = createFileRoute('/import/$name')({
  component: DnsImportPage,
  validateSearch: (search: Record<string, unknown>): DnsImportSearch => ({
    type: search.type === 'onchain' ? 'onchain' : 'offchain',
    // `dnssec` and `verify` were separate steps before the two were merged;
    // keep old links working by landing them on the combined step.
    step:
      search.step === 'setup' ||
      search.step === 'dnssec' ||
      search.step === 'verify'
        ? 'setup'
        : 'start',
  }),
})
