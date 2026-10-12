import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'react-external-link'
import { AnalyticsNotice } from '@/features/consent/AnalyticsNotice'

export const Route = createFileRoute('/privacy')({
  component: RouteComponent,
  staticData: { hideSidebar: true },
})

function RouteComponent() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-6 pb-18">
      <h1 className="font-serif text-page-title font-[350] text-foreground leading-[1.35]">
        Privacy notice
      </h1>
      <p className="mt-4 text-p text-foreground">
        This notice explains what the ENS Explorer measures about how it is
        used. For the policy covering all ENS sites, see{' '}
        <ExternalLink
          className="underline"
          href="https://app.ens.domains/legal/privacy-policy"
        >
          the full privacy policy
        </ExternalLink>
        .
      </p>
      <div className="mt-6">
        <AnalyticsNotice />
      </div>
    </main>
  )
}
