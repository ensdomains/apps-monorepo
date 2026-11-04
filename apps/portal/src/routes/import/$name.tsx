import { createFileRoute } from '@tanstack/react-router'
import { PageContainer } from '@/components/PageContainer'
import { TopNav } from '@/components/TopNav'
import {
  DnsImportFlow,
  type DnsImportSearch,
} from '@/features/dns-import/components/DnsImportFlow'

const DnsImportPage = () => {
  const { name } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <>
      <TopNav />
      <main className="w-full min-w-0">
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
      </main>
    </>
  )
}

export const Route = createFileRoute('/import/$name')({
  component: DnsImportPage,
  validateSearch: (search: Record<string, unknown>): DnsImportSearch => ({
    // Onchain is the first option offered, so it is what an unqualified link
    // preselects — matching the CTA that describes the onchain record.
    type: search.type === 'offchain' ? 'offchain' : 'onchain',
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
