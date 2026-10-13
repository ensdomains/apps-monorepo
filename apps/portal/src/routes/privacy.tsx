import { createFileRoute } from '@tanstack/react-router'
import { AnalyticsNotice } from '@/features/consent/AnalyticsNotice'

export const Route = createFileRoute('/privacy')({
  component: RouteComponent,
  staticData: { hideSidebar: true },
})

// Sections 1 to 8 are a copy of the Manager's PrivacyPolicyPage: that text
// has been checked by legal and must not be edited here. privacy.test.tsx
// fails if the rendered text drifts from the Manager's source.
function RouteComponent() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-6 pb-18">
      <h1 className="font-serif text-page-title font-[350] text-foreground leading-[1.35]">
        Privacy Policy
      </h1>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">1. Introduction</h2>
        <p className="mt-4 text-p text-foreground">
          This privacy policy applies to all personal data collected by the ENS
          Foundation and its subcontractors across its websites and
          applications, including ens.domains. Users consent to these data
          practices by continuing to use the service.
        </p>
        <p className="mt-4 text-p text-foreground">
          The organization defines personal data as information that identifies
          individuals.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">
          2. Data Types Collected
        </h2>
        <p className="mt-4 text-p text-foreground">
          The foundation gathers several categories of data:
        </p>
        <ul className="mt-4 text-p text-foreground">
          <li>Contact information (names, emails, phone numbers)</li>
          <li>
            Technical data (IP addresses, browser information, device details)
          </li>
          <li>Usage patterns and transaction details</li>
          <li>Profile information and blockchain addresses</li>
          <li>Marketing preferences</li>
          <li>
            Data from activity that is publicly visible and/or accessible on
            blockchains
          </li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">
          3. Collection Methods
        </h2>
        <p className="mt-4 text-p text-foreground">
          Data comes through direct interactions (forms, emails, Discord),
          automated tracking via cookies and pixel tags, and third-party sources
          like wallet providers.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">4. Cookie Usage</h2>
        <p className="mt-4 text-p text-foreground">
          The policy outlines use of session and persistent cookies for
          analytics, functionality, and targeting purposes. Users may disable
          cookies through browser settings.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">
          5. Data Purposes
        </h2>
        <p className="mt-4 text-p text-foreground">
          Personal data supports various purposes including:
        </p>
        <ul className="mt-4 text-p text-foreground">
          <li>Website functionality</li>
          <li>Customer support</li>
          <li>Contract performance</li>
          <li>Legal compliance</li>
          <li>Fraud prevention</li>
          <li>Marketing communications</li>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">
          6. Data Protection
        </h2>
        <p className="mt-4 text-p text-foreground">
          The foundation implements administrative, physical, and technical
          safeguards. However, no method of transmission over the Internet is
          completely secure.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">7. User Rights</h2>
        <p className="mt-4 text-p text-foreground">
          Individuals may access, correct, or withdraw consent for data
          processing by contacting{' '}
          <a className="underline" href="mailto:privacy@ens.domains">
            privacy@ens.domains
          </a>
          .
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-medium text-foreground text-lg">
          8. Retention and Governance
        </h2>
        <p className="mt-4 text-p text-foreground">
          Data is retained as long as necessary for the purposes outlined in
          this policy. This policy is governed by Singapore law with dispute
          resolution through arbitration.
        </p>
      </section>

      <section className="mt-6" id="analytics">
        <h2 className="font-medium text-foreground text-lg">9. Analytics</h2>
        <div className="mt-4">
          <AnalyticsNotice />
        </div>
      </section>
    </main>
  )
}
