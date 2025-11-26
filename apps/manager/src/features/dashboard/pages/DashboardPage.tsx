import { Link } from '@tanstack/react-router'
import {
  Calendar,
  ChevronDown,
  Clock,
  Info,
  MoreHorizontal,
  Search,
  Star,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, LinkButton } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { DashboardSidebar } from '@/features/dashboard/components/DashboardSidebar'
import {
  type DashboardNameRow,
  MOCK_DASHBOARD_HEADER,
  MOCK_DASHBOARD_NAMES,
} from '@/features/dashboard/MOCK'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const formatDate = (value?: Date | null) => {
  if (!value) return '—'
  try {
    return dateFormatter.format(value)
  } catch {
    return '—'
  }
}

const truncateAddress = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

const faqItems = [
  {
    question: 'How do I renew a name?',
    answer:
      'Go to Manage renewals to see upcoming expiries and extend your names before they lapse.',
  },
  {
    question: 'Can I transfer my ENS name?',
    answer:
      'Yes. From a name’s profile you can transfer ownership to another address at any time.',
  },
  {
    question: 'What is a primary name?',
    answer:
      'A primary name is the main ENS name attached to your wallet address. Apps can display it instead of your address.',
  },
  {
    question: 'Can I use ENS across chains?',
    answer:
      'ENS names are registered on Ethereum mainnet but can be used as identities across many ecosystems.',
  },
  {
    question: 'How can I keep my ENS names safe?',
    answer:
      'Use a secure wallet, be cautious of signing unknown transactions, and verify links before connecting.',
  },
]

type PrimaryNameCardProps = {
  primaryName: string
  address: string
  registeredDate: Date
  expiryDate: Date
  avatarUrl?: string | null
}

const PrimaryNameCard = ({
  primaryName,
  address,
  registeredDate,
  expiryDate,
  avatarUrl,
}: PrimaryNameCardProps) => {
  const hasAvatar = Boolean(avatarUrl)

  return (
    <Card className="rounded-2xl border bg-white/90 shadow-sm">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          <div className="h-[160px] w-[160px] overflow-hidden rounded-2xl bg-muted">
            {hasAvatar ? (
              <img
                src={avatarUrl as string}
                alt={primaryName}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-ens-blue/40 via-ens-blue to-ens-blue-midnight" />
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center rounded-full bg-ens-blue px-5 py-2 font-semibold text-2xl text-white">
                {primaryName}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#F4F7FB] px-4 py-1 font-medium text-ens-blue text-xs">
                Primary Name
                <span className="flex size-4 items-center justify-center rounded-full border border-ens-blue bg-white text-ens-blue">
                  ✓
                </span>
              </span>
            </div>

            <div className="flex flex-col gap-2 text-muted-foreground text-sm md:flex-row md:gap-8">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                <span>Registered</span>
                <span className="font-medium text-foreground">
                  {registeredDate ? dateFormatter.format(registeredDate) : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <span>Expires</span>
                <span className="font-medium text-foreground">
                  {expiryDate ? dateFormatter.format(expiryDate) : '—'}
                </span>
              </div>
            </div>

            <div className="text-muted-foreground text-sm">
              Wallet{' '}
              <span className="font-medium text-foreground">
                {address ? truncateAddress(address) : 'Not connected'}
              </span>
            </div>
          </div>
        </div>

        {primaryName && (
          <LinkButton
            to="/p/$name"
            params={{ name: primaryName }}
            variant="outline"
            size="lg"
            className="mt-4 whitespace-nowrap md:mt-0"
          >
            View profile →
          </LinkButton>
        )}
      </div>
    </Card>
  )
}

const NamesTable = ({
  names,
  isLoading,
  error,
}: {
  names?: DashboardNameRow[]
  isLoading: boolean
  error: unknown
}) => {
  if (isLoading) {
    return (
      <Card className="border bg-white/90">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Loading your names...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border bg-white/90">
        <CardContent className="flex items-center gap-2 border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          <Info className="size-4" />
          <span>We couldn&apos;t load your names. Please try again.</span>
        </CardContent>
      </Card>
    )
  }

  if (!names || names.length === 0) {
    return (
      <Card className="border bg-white/90">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No ENS names found for this wallet yet.
        </CardContent>
      </Card>
    )
  }

  const favouriteSlice = names.slice(0, 3)

  return (
    <div className="space-y-6">
      <Card className="border bg-white/90">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">My Names</h3>
              <Badge variant="lightBlue" className="rounded-full px-2 py-0.5">
                {names.length}
              </Badge>
            </div>
            <div className="w-64">
              <Input
                size="sm"
                placeholder="Search my name..."
                startIcon={<Search className="size-4" />}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-6 text-muted-foreground text-xs">
            <div className="w-6" />
            <div className="flex flex-1 items-center gap-1">
              <span>Name</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="flex w-40 items-center gap-1">
              <span>Registered on</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="flex w-40 items-center gap-1">
              <span>Expiry</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="flex w-40 items-center gap-1">
              <span>Autorenewal</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="w-6" />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex items-center gap-3 border-b px-6 py-3 text-xs">
            <input
              type="checkbox"
              className="size-4 rounded border border-gray-300"
              aria-label="Select all"
            />
            <span className="font-medium text-muted-foreground">
              Select all
            </span>
          </div>

          {names.map((name) => {
            const daysUntilExpiry =
              name.expiryDate != null
                ? Math.ceil(
                    (name.expiryDate.getTime() - Date.now()) /
                      (1000 * 60 * 60 * 24),
                  )
                : null

            const expiresLabel =
              daysUntilExpiry != null && daysUntilExpiry > 0
                ? `Expires in ${daysUntilExpiry} days`
                : null

            return (
              <div
                key={name.id}
                className="flex items-start gap-4 border-b px-6 py-4 last:border-b-0"
              >
                <div className="pt-2">
                  <input
                    type="checkbox"
                    className="size-4 rounded border border-gray-300"
                    aria-label={`Select ${name.name}`}
                  />
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {name.isPrimary && (
                    <div className="inline-flex items-center gap-2">
                      <Badge
                        variant="lightBlue"
                        className="rounded-full px-2 py-0.5 text-xs"
                      >
                        Primary Name
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted" />
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-ens-blue hover:bg-transparent"
                    >
                      <Link to="/p/$name" params={{ name: name.name }}>
                        <span className="font-semibold text-sm">
                          {name.name}
                        </span>
                      </Link>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span>Make Primary Name</span>
                    <Switch checked={name.isPrimary} disabled aria-hidden />
                  </div>
                </div>

                <div className="w-40 pt-2 text-sm">
                  {formatDate(name.registrationDate ?? null)}
                </div>

                <div className="w-40 pt-2 text-sm">
                  <div>{formatDate(name.expiryDate ?? null)}</div>
                  <button
                    type="button"
                    className="mt-1 font-medium text-ens-blue text-xs"
                  >
                    Extend →
                  </button>
                  {expiresLabel && (
                    <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                      <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500" />
                      {expiresLabel}
                    </div>
                  )}
                </div>

                <div className="w-40 pt-2 text-sm">
                  <div>
                    {formatDate(name.autoRenewalDate ?? name.expiryDate)}
                  </div>
                  <button
                    type="button"
                    className="mt-1 font-medium text-ens-blue text-xs"
                  >
                    Autorenewals →
                  </button>
                </div>

                <button
                  type="button"
                  className="mt-2 ml-auto text-muted-foreground"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-5" />
                </button>
              </div>
            )
          })}

          <div className="flex items-center justify-between border-t px-6 py-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full border border-gray-300 text-gray-500"
              >
                ‹
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full bg-ens-blue text-white"
              >
                1
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full border border-gray-300 text-gray-500"
              >
                2
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full border border-gray-300 text-gray-500"
              >
                ›
              </button>
            </div>
            <span>
              Showing 1-{Math.min(5, names.length)} of {names.length}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border bg-white/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="size-4 text-ens-blue" />
            Favourites
          </CardTitle>
          <CardDescription>
            A quick list of names you use the most.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {favouriteSlice.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              When you start collecting names, you&apos;ll be able to pin your
              favourites here.
            </p>
          ) : (
            <ul className="space-y-2">
              {favouriteSlice.map((name) => (
                <li
                  key={name.id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Star className="size-4 text-ens-blue" />
                    <span className="text-sm">
                      {name.name ?? name.truncatedName ?? 'Unnamed'}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    Expires {formatDate(name.expiryDate ?? null)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

const DidYouKnowSection = () => (
  <Card className="border bg-white/90">
    <CardHeader>
      <CardTitle>Did you know?</CardTitle>
      <CardDescription>
        ENS names are more than just .eth usernames. Use them across apps,
        networks, and wallets.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2 rounded-xl bg-ens-blue/5 p-4">
        <div className="font-semibold text-ens-blue text-xs uppercase">
          One username, many places
        </div>
        <p className="text-muted-foreground text-sm">
          Set a primary name once and use it across compatible apps, wallets,
          and dapps instead of copying long addresses.
        </p>
      </div>
      <div className="space-y-2 rounded-xl bg-pink-50 p-4">
        <div className="font-semibold text-pink-600 text-xs uppercase">
          Stay safe
        </div>
        <p className="text-muted-foreground text-sm">
          Always double-check links and transactions before signing. ENS names
          help you recognise trusted accounts more easily.
        </p>
      </div>
    </CardContent>
  </Card>
)

const FaqSection = () => (
  <Card className="border bg-white/90">
    <CardHeader>
      <CardTitle>Frequently Asked Questions</CardTitle>
      <CardDescription>
        Quick answers to common questions about managing your ENS names.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-1">
      {faqItems.map(({ question, answer }) => (
        <Collapsible key={question}>
          <div className="border-t first:border-t-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-1 py-3 text-left font-medium text-sm">
              <span>{question}</span>
              <span className="ml-4 text-muted-foreground text-xs">+</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1 pb-3 text-muted-foreground text-sm">
              {answer}
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </CardContent>
  </Card>
)

export const DashboardPage = () => {
  const header = MOCK_DASHBOARD_HEADER
  const names = MOCK_DASHBOARD_NAMES

  const displayName = header.primaryName

  const hasProfile = true
  const hasNames = names.length > 0

  return (
    <div className="mx-auto flex max-w-6xl items-start gap-8 px-6 py-8">
      <DashboardSidebar
        hasProfile={hasProfile}
        profileName={header.primaryName}
      />

      <div className="flex-1 space-y-6">
        <section className="space-y-4">
          <div className="space-y-2">
            <h1 className="font-semibold text-3xl">Hello {displayName}</h1>
            <p className="text-muted-foreground text-sm">
              View your primary ENS name, manage your names, and explore tips
              and resources.
            </p>
          </div>
        </section>

        <PrimaryNameCard
          primaryName={header.primaryName}
          address={header.address}
          registeredDate={header.registeredDate}
          expiryDate={header.expiryDate}
          avatarUrl={header.avatarUrl}
        />

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-xl">My Names</h2>
            {hasNames && (
              <span className="text-muted-foreground text-xs">
                Showing {names.length} names linked to this wallet
              </span>
            )}
          </div>
          <NamesTable names={names} isLoading={false} error={undefined} />
        </section>

        <DidYouKnowSection />
        <FaqSection />
      </div>
    </div>
  )
}
