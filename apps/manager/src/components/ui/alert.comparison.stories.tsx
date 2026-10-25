// Before/after review for WEB-1836. The Legacy* renderings are the old
// hand-built banner markup, kept only for this comparison. Delete this file
// once design signs off.
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  Clock,
  Wallet,
  XCircle,
} from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { fn } from 'storybook/test'
import { FailureStep as BulkRenewFailureStep } from '@/features/bulk-renew/components/FailureStep'
import { RegistrationCompletionBanner } from '@/features/register-v2/workflow/registering/components/RegistrationCompletionBanner'
import { RenewalCompletionBanner } from '@/features/renew/workflow/renewing/components/RenewalCompletionBanner'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Dialog } from './dialog'

const LABEL = 'mymind'

const LONG_REVERT_REASON =
  'ContractFunctionExecutionError: The contract function "register" reverted with the following signature: 0x1fa9c3e2b7d84f6a90e1c5b3d7f2a8e4c6b0d9f1e3a5c7b9d1f3e5a7c9b1d3f5130d sender: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

const WALLET_BUSY_MESSAGE = `${LABEL}.eth is already being registered with this wallet, possibly in another tab. One registration runs at a time, so this one has not started.`

const RENEW_FALLBACK_MESSAGE = `The renewal for ${LABEL}.eth could not be completed. You can retry or go back to adjust your settings.`

const PRIMARY_NAME_SETUP_MESSAGE =
  "Your name was registered, but we couldn't set it as your primary name. You can set it anytime from your profile."

// truncateAddress output for 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
const TRUNCATED_OWNER = '0xd8dA...6045'

const RESUME_MESSAGE = `Connect wallet ${TRUNCATED_OWNER} to resume registering ${LABEL}.eth. Starting over from another wallet would abandon the payment already made.`

const GENERIC_DESCRIPTION = 'Supporting text for the alert.'

// Everything below until the "After" section is copied verbatim from the
// pre-WEB-1836 markup, arbitrary Tailwind values included, so the old look
// renders exactly as it shipped.

type LegacyAlertVariant = 'default' | 'destructive' | 'warning'

const LEGACY_ALERT_BASE = cn(
  'relative grid w-full items-start gap-y-0.5',
  'grid-cols-[0_1fr] has-[>svg,>.material-symbol]:grid-cols-[calc(var(--spacing)*4)_1fr]',
  'rounded-lg border px-4 py-3 text-sm',
  'has-[>svg,>.material-symbol]:gap-x-3',
  '[&>svg,&>.material-symbol]:size-4 [&>svg,&>.material-symbol]:translate-y-0.5 [&>svg,&>.material-symbol]:text-current',
)

const LEGACY_ALERT_VARIANTS: Readonly<Record<LegacyAlertVariant, string>> = {
  default: 'bg-card text-card-foreground',
  destructive:
    'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg,&>.material-symbol]:text-current',
  warning:
    'border-amber-200 bg-amber-50 text-amber-900 *:data-[slot=alert-description]:text-amber-900/90 [&>svg,&>.material-symbol]:text-current',
}

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyAlert = ({
  className,
  variant = 'default',
  ...props
}: Readonly<ComponentProps<'div'> & { variant?: LegacyAlertVariant }>) => (
  <div
    className={cn(LEGACY_ALERT_BASE, LEGACY_ALERT_VARIANTS[variant], className)}
    data-slot="alert"
    {...props}
  />
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyAlertTitle = ({
  className,
  ...props
}: Readonly<ComponentProps<'div'>>) => (
  <div
    className={cn(
      'col-start-2 min-h-4',
      'line-clamp-1',
      'font-medium tracking-tight',
      className,
    )}
    data-slot="alert-title"
    {...props}
  />
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyAlertDescription = ({
  className,
  ...props
}: Readonly<ComponentProps<'div'>>) => (
  <div
    className={cn(
      'col-start-2 grid min-w-0 justify-items-start gap-1',
      'wrap-anywhere text-muted-foreground text-sm',
      '[&_p]:leading-relaxed',
      className,
    )}
    data-slot="alert-description"
    {...props}
  />
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyRegistrationCompletionBanner = () => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
    <CheckCircle2
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-ens-peridot-text-dark"
    />
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-medium text-ens-peridot-text-dark text-sm leading-5">
        Registration Complete!
      </p>
      <p className="text-ens-peridot-text-medium text-sm leading-5">
        Your ENS domain has been successfully registered and is now active.
      </p>
    </div>
  </div>
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyRenewalCompletionBanner = () => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
    <CheckCircle2
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-ens-peridot-text-dark"
    />
    <div className="flex flex-col gap-1">
      <p className="font-medium text-ens-peridot-text-dark text-sm leading-5">
        Renewal Complete!
      </p>
      <p className="text-ens-peridot-text-medium text-sm leading-5">
        The ENS domain has been successfully renewed.
      </p>
    </div>
  </div>
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyLapisFailureBanner = ({
  title,
  message,
  isWalletBusy = false,
}: {
  readonly title: string
  readonly message: string
  readonly isWalletBusy?: boolean
}) => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-lapis-dust bg-ens-lapis-tint p-4">
    {isWalletBusy ? (
      <Clock
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-ens-lapis-dense"
      />
    ) : (
      <XCircle
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-ens-lapis-dense"
      />
    )}
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-medium text-ens-lapis-dense text-sm leading-5">
        {title}
      </p>
      <p className="wrap-anywhere max-h-32 overflow-y-auto text-ens-lapis-dense/70 text-sm leading-5">
        {message}
      </p>
    </div>
  </div>
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyBulkRenewFailureBanner = ({
  message,
}: {
  readonly message: string
}) => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-garnet-dust bg-ens-garnet-dust/15 p-4">
    <XCircle
      aria-hidden
      className="mt-0.5 size-4 shrink-0 text-ens-garnet-dense"
    />
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-medium font-sans text-ens-garnet-dense text-sm">
        Something went wrong
      </p>
      <p className="wrap-anywhere max-h-32 overflow-y-auto font-sans text-ens-garnet-dense/70 text-sm">
        {message}
      </p>
    </div>
  </div>
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyPrimaryNameSetupNotice = () => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-orange-light bg-ens-yellow-light p-4">
    <AlertCircle
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-ens-orange"
    />
    <p className="text-ens-gray text-sm leading-5">
      {PRIMARY_NAME_SETUP_MESSAGE}
    </p>
  </div>
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyResumeConnectWalletBanner = () => (
  <LegacyAlert variant="warning">
    <Wallet className="h-4 w-4" />
    <LegacyAlertTitle>Unfinished registration</LegacyAlertTitle>
    <LegacyAlertDescription>{RESUME_MESSAGE}</LegacyAlertDescription>
  </LegacyAlert>
)

/** @deprecated Pre-WEB-1836 markup, kept for the before/after comparison only. */
const LegacyGenericAlert = ({
  variant,
  title,
}: {
  readonly variant: LegacyAlertVariant
  readonly title: string
}) => (
  <LegacyAlert variant={variant}>
    <LegacyAlertTitle>{title}</LegacyAlertTitle>
    <LegacyAlertDescription>{GENERIC_DESCRIPTION}</LegacyAlertDescription>
  </LegacyAlert>
)

// After: the real components, or the exact Alert a context-bound one renders.

/**
 * Mirrors the banner at the top of the register and renew failure pages. The
 * rest of those pages is unchanged and too wide for a comparison column; the
 * full pages live in their own feature stories.
 */
const FailurePageBannerAfter = ({
  title,
  message,
  isWalletBusy = false,
}: {
  readonly title: string
  readonly message: string
  readonly isWalletBusy?: boolean
}) => (
  <Alert
    icon={isWalletBusy ? <Clock className="size-4" /> : undefined}
    variant="error"
  >
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription className="max-h-32 overflow-y-auto">
      {message}
    </AlertDescription>
  </Alert>
)

const BulkRenewFailureAfter = () => (
  // DialogTitle needs a Dialog around it; no content portal, so it renders inline.
  <Dialog open>
    <div className="flex flex-col gap-4">
      <BulkRenewFailureStep
        errorMessage={LONG_REVERT_REASON}
        onBack={fn()}
        onRetry={fn()}
      />
    </div>
  </Dialog>
)

/** Mirrors PrimaryNameSetupNotice, which reads the registration machine. */
const PrimaryNameSetupNoticeAfter = () => (
  <Alert icon={<CircleAlert className="size-4" />} variant="warning">
    <AlertDescription>{PRIMARY_NAME_SETUP_MESSAGE}</AlertDescription>
  </Alert>
)

/** Mirrors ResumeConnectWalletBanner, which reads the registration context. */
const ResumeConnectWalletAfter = () => (
  <Alert icon={<Wallet className="size-4" />} variant="warning">
    <AlertTitle>Unfinished registration</AlertTitle>
    <AlertDescription>{RESUME_MESSAGE}</AlertDescription>
  </Alert>
)

type ComparisonCase = {
  readonly title: string
  readonly before: ReactNode
  readonly after: ReactNode
}

const Column = ({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) => (
  <div className="flex w-120 max-w-full flex-col gap-2">
    <span className="font-mono text-ens-gray text-xs uppercase">{label}</span>
    {children}
  </div>
)

const Comparison = ({ title, before, after }: ComparisonCase) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-medium text-base text-ens-blue-dark">{title}</h2>
    <div className="flex flex-wrap items-start gap-8">
      <Column label="Before (deprecated)">{before}</Column>
      <Column label="After">{after}</Column>
    </div>
  </section>
)

const registrationSuccessCase: ComparisonCase = {
  title: 'Registration success',
  before: <LegacyRegistrationCompletionBanner />,
  after: <RegistrationCompletionBanner />,
}

const renewalSuccessCase: ComparisonCase = {
  title: 'Renewal success',
  before: <LegacyRenewalCompletionBanner />,
  after: <RenewalCompletionBanner />,
}

const registerFailureCase: ComparisonCase = {
  title: 'Register failure (long revert)',
  before: (
    <LegacyLapisFailureBanner
      message={LONG_REVERT_REASON}
      title="Registration Failed"
    />
  ),
  after: (
    <FailurePageBannerAfter
      message={LONG_REVERT_REASON}
      title="Registration Failed"
    />
  ),
}

const registerFailureWalletBusyCase: ComparisonCase = {
  title: 'Register failure, wallet busy',
  before: (
    <LegacyLapisFailureBanner
      isWalletBusy
      message={WALLET_BUSY_MESSAGE}
      title="Another Registration Is Running"
    />
  ),
  after: (
    <FailurePageBannerAfter
      isWalletBusy
      message={WALLET_BUSY_MESSAGE}
      title="Another Registration Is Running"
    />
  ),
}

const renewFailureCase: ComparisonCase = {
  title: 'Renew failure',
  before: (
    <LegacyLapisFailureBanner
      message={RENEW_FALLBACK_MESSAGE}
      title="Renewal Failed"
    />
  ),
  after: (
    <FailurePageBannerAfter
      message={RENEW_FALLBACK_MESSAGE}
      title="Renewal Failed"
    />
  ),
}

const bulkRenewFailureCase: ComparisonCase = {
  title: 'Bulk renew failure',
  before: <LegacyBulkRenewFailureBanner message={LONG_REVERT_REASON} />,
  after: <BulkRenewFailureAfter />,
}

const primaryNameSetupNoticeCase: ComparisonCase = {
  title: 'Primary name setup notice',
  before: <LegacyPrimaryNameSetupNotice />,
  after: <PrimaryNameSetupNoticeAfter />,
}

const resumeConnectWalletCase: ComparisonCase = {
  title: 'Resume, connect wallet',
  before: <LegacyResumeConnectWalletBanner />,
  after: <ResumeConnectWalletAfter />,
}

const genericDefaultCase: ComparisonCase = {
  title: 'UI Alert, default',
  before: <LegacyGenericAlert title="Alert title" variant="default" />,
  after: (
    <Alert variant="default">
      <AlertTitle>Alert title</AlertTitle>
      <AlertDescription>{GENERIC_DESCRIPTION}</AlertDescription>
    </Alert>
  ),
}

const genericDestructiveCase: ComparisonCase = {
  title: 'UI Alert, destructive',
  before: (
    <LegacyGenericAlert title="Notifications blocked" variant="destructive" />
  ),
  after: (
    <Alert variant="destructive">
      <AlertTitle>Notifications blocked</AlertTitle>
      <AlertDescription>{GENERIC_DESCRIPTION}</AlertDescription>
    </Alert>
  ),
}

const genericWarningCase: ComparisonCase = {
  title: 'UI Alert, warning',
  before: (
    <LegacyGenericAlert title="Unfinished registration" variant="warning" />
  ),
  after: (
    <Alert variant="warning">
      <AlertTitle>Unfinished registration</AlertTitle>
      <AlertDescription>{GENERIC_DESCRIPTION}</AlertDescription>
    </Alert>
  ),
}

const allCases: readonly ComparisonCase[] = [
  registrationSuccessCase,
  renewalSuccessCase,
  registerFailureCase,
  registerFailureWalletBusyCase,
  renewFailureCase,
  bulkRenewFailureCase,
  primaryNameSetupNoticeCase,
  resumeConnectWalletCase,
  genericDefaultCase,
  genericDestructiveCase,
  genericWarningCase,
]

const meta = {
  title: 'UI/Alert/Before vs After (WEB-1836)',
  component: Comparison,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Before/after review for WEB-1836. "Before (deprecated)" is the pre-WEB-1836 hand-built banner markup, copied verbatim and kept only for this comparison. "After" is the current `Alert`-based component. Delete this file once design signs off.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="bg-white p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Comparison>

export default meta
type Story = StoryObj<typeof meta>

export const RegistrationSuccess: Story = { args: registrationSuccessCase }

export const RenewalSuccess: Story = { args: renewalSuccessCase }

/** After mirrors the failure page banner; the full page is in Features/Register v2/Failure page. */
export const RegisterFailure: Story = { args: registerFailureCase }

export const RegisterFailureWalletBusy: Story = {
  args: registerFailureWalletBusyCase,
}

/** After mirrors the failure page banner; the full page is in Features/Renew/Failure page. */
export const RenewFailure: Story = { args: renewFailureCase }

export const BulkRenewFailure: Story = { args: bulkRenewFailureCase }

/** After mirrors the Alert that PrimaryNameSetupNotice renders; the component needs the registration machine. */
export const PrimaryNameSetupNotice: Story = {
  args: primaryNameSetupNoticeCase,
}

/** After mirrors the Alert that ResumeConnectWalletBanner renders; the component needs the registration context. */
export const ResumeConnectWallet: Story = { args: resumeConnectWalletCase }

export const GenericDefault: Story = { args: genericDefaultCase }

export const GenericDestructive: Story = { args: genericDestructiveCase }

export const GenericWarning: Story = { args: genericWarningCase }

/** Every pair stacked, for one full screenshot. */
export const AllBanners: Story = {
  args: registrationSuccessCase,
  render: () => (
    <div className="flex flex-col gap-10">
      {allCases.map((comparison) => (
        <Comparison key={comparison.title} {...comparison} />
      ))}
    </div>
  ),
}
