import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Heart,
  MoreHorizontal,
  Search,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  type DashboardNameRow,
  MOCK_FAVORITE_NAMES,
} from '@/features/dashboard/MOCK'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
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

interface NamesTableProps {
  names?: DashboardNameRow[]
  isLoading: boolean
  error: unknown
}

export const MyNamesCard = ({ names, isLoading, error }: NamesTableProps) => {
  const [activeTab, setActiveTab] = useState<'myNames' | 'favorites'>('myNames')

  const displayNames = useMemo(
    () => (activeTab === 'myNames' ? (names ?? []) : MOCK_FAVORITE_NAMES),
    [activeTab, names],
  )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading names</div>

  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-[20px]">
        <div className="flex items-center gap-[40px]">
          <button
            type="button"
            onClick={() => setActiveTab('myNames')}
            className="flex items-center gap-[12px]"
          >
            <span
              className={`font-serif text-[28px] leading-[0.96] tracking-[0.28px] ${activeTab === 'myNames' ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
            >
              My Names
            </span>
            <div
              className={`flex h-[20px] items-center justify-center rounded-[14px] px-[6.5px] py-[1.6px] ${activeTab === 'myNames' ? 'bg-[#e5f7ff]' : 'border-[#8c8c8c] border-[0.5px]'}`}
            >
              <span
                className={`font-sans text-[14px] leading-[1.05] ${activeTab === 'myNames' ? 'text-[#0080bc]' : 'text-[#8c8c8c]'}`}
              >
                {names?.length ?? 0}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className="flex items-center gap-[12px]"
          >
            <span
              className={`font-serif text-[28px] leading-[0.96] tracking-[0.28px] ${activeTab === 'favorites' ? 'text-[#232222]' : 'text-[#a9a9a9]'}`}
            >
              {activeTab === 'favorites' ? 'Favorites List' : 'Favorites'}
            </span>
            <div
              className={`flex h-[20px] items-center justify-center rounded-[14px] px-[6.5px] py-[1.6px] ${activeTab === 'favorites' ? 'bg-[#ffecf5]' : 'border-[#8c8c8c] border-[0.5px]'}`}
            >
              <span
                className={`font-sans text-[14px] leading-[1.05] ${activeTab === 'favorites' ? 'text-[#f53293]' : 'text-[#8c8c8c]'}`}
              >
                {MOCK_FAVORITE_NAMES.length}
              </span>
            </div>
          </button>
        </div>

        <div className="w-[292px]">
          <Input
            size="sm"
            placeholder={
              activeTab === 'myNames' ? 'Search my name...' : 'Search name...'
            }
            startIcon={<Search className="size-[18px] text-[#8c8c8c]" />}
            className="h-[32px] rounded-[4.1px] border-none bg-[#f6f6f6] text-[#8c8c8c] text-[13.12px] placeholder:text-[#8c8c8c]"
          />
        </div>
      </div>

      {activeTab === 'myNames' ? (
        <div className="relative mb-[16px] h-[32px] w-full">
          <div className="absolute top-[4px] left-[24px] flex items-center gap-[8px]">
            <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
              Name
            </span>
            <div className="flex flex-col">
              <ChevronDown className="size-[8.2px] rotate-180 text-[#7d7d7d]" />
              <ChevronDown className="size-[8.2px] text-[#7d7d7d]" />
            </div>
          </div>
          <div className="absolute top-[4px] left-[652px] flex items-center gap-[8px]">
            <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
              Expiry
            </span>
            <div className="flex flex-col">
              <ChevronDown className="size-[8.2px] rotate-180 text-[#7d7d7d]" />
              <ChevronDown className="size-[8.2px] text-[#7d7d7d]" />
            </div>
          </div>
        </div>
      ) : (
        <div className="box-border flex w-full items-center justify-between py-[4px] pr-0 pl-[28px]">
          <div className="flex items-center gap-[8px]">
            <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
              Name
            </span>
            <div className="flex flex-col">
              <ChevronDown className="size-[8.2px] rotate-180 text-[#7d7d7d]" />
              <ChevronDown className="size-[8.2px] text-[#7d7d7d]" />
            </div>
          </div>
          <div className="flex w-[189px] items-center gap-[6px]">
            <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
              Receive expiry notifications
            </span>
            <Switch className="h-[16.09px] w-[28px] data-[state=checked]:bg-[#0f172b]" />
          </div>
        </div>
      )}

      {activeTab === 'myNames' && (
        <div className="mb-[16px] flex h-[32px] items-center gap-[12px]">
          <div className="size-[12px] rounded-[3px] border-[#7d7d7d] border-[0.41px]" />
          <span className="font-sans text-[#232222] text-[14px] tracking-[0.28px]">
            Select all
          </span>
        </div>
      )}

      <div className="flex w-full flex-col">
        {displayNames.map((name) => {
          if (activeTab === 'favorites') {
            return (
              <div
                key={name.id}
                className="box-border flex h-[64px] flex-col items-start justify-center gap-[16px] border-[lightgrey] border-t-0 border-r-0 border-b-[0.41px] border-l-0 px-0 py-[24px] last:border-b-0"
              >
                <div className="flex w-full items-center">
                  <div className="flex w-[300px] items-center gap-[25px]">
                    <div className="flex items-center gap-[12px]">
                      <Heart className="size-[16px] shrink-0 fill-[#ed5499] text-[#ed5499]" />
                      <div className="relative size-[36.9px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6]">
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-200 to-blue-200" />
                      </div>
                      <div className="flex h-[24px] shrink-0 items-center justify-center rounded-[2.867px] bg-[#e5f7ff] px-[8px] py-[4px]">
                        <Link
                          to="/p/$name"
                          params={{ name: name.name }}
                          className="mr-2 font-medium font-mono text-[#0080bc] text-[16px] leading-[0.96] tracking-[-0.32px]"
                        >
                          {name.name}
                        </Link>
                        <ArrowUpRight
                          className="size-[7px] shrink-0 text-[#0080bc]"
                          strokeWidth={3}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          const daysUntilExpiry = name.expiryDate
            ? Math.ceil(
                (name.expiryDate.getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24),
              )
            : 0
          const isExpiringSoon = daysUntilExpiry > 0 && daysUntilExpiry <= 30

          return (
            <div
              key={name.id}
              className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
            >
              {name.isPrimary && (
                <div className="mb-[10px] px-[24px]">
                  <div className="inline-flex items-center gap-[8px] rounded-[73px] bg-[#f6f6f6] px-[6.5px] py-[3.28px]">
                    <span className="font-sans text-[#0080bc] text-[12px] leading-[1.15] tracking-[-0.24px]">
                      Primary Name
                    </span>
                    <div className="flex size-[10px] items-center justify-center rounded-full bg-[#0080bc]">
                      <Check
                        className="size-[6px] text-[#f6f6f6]"
                        strokeWidth={4}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex w-[340px] items-center gap-[25px]">
                  <div className="flex items-center gap-[12px]">
                    <div className="size-[12px] rounded-[3px] border-[#7d7d7d] border-[0.41px]" />
                    <div className="relative size-[36.9px] overflow-hidden rounded-full bg-[#faf9f6]">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-200 to-blue-200" />
                    </div>
                    <div className="flex h-[24px] items-center justify-center rounded-[2.8px] bg-[#e5f7ff] px-[8px] py-[4px]">
                      <Link
                        to="/p/$name"
                        params={{ name: name.name }}
                        className="mr-2 font-medium font-mono text-[#0080bc] text-[16px] tracking-[-0.32px]"
                      >
                        {name.name}
                      </Link>
                      <ArrowUpRight
                        className="size-[7px] text-[#0080bc]"
                        strokeWidth={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-[30px]">
                  <div className="flex w-[120px] flex-col items-start gap-[4px]">
                    <div className="flex flex-col items-start">
                      <span className="font-sans text-[#515151] text-[14px] leading-[1.8]">
                        {formatDate(name.expiryDate)}
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-[3.28px]">
                      <button
                        type="button"
                        className="flex items-center gap-[4.92px] text-[#0080bc]"
                      >
                        <span className="font-sans text-[12px] leading-[1.8]">
                          Extend
                        </span>
                        <ArrowRight
                          className="size-[7.538px]"
                          strokeWidth={3}
                        />
                      </button>
                    </div>

                    {isExpiringSoon && (
                      <div className="flex items-center gap-[4px] rounded-[20px] bg-[#fff8f0] p-[4px]">
                        <CircleAlert
                          className="size-[12px] text-[#e3a531]"
                          strokeWidth={2}
                        />
                        <span className="font-sans text-[#c68a1b] text-[12px] leading-[1.05] tracking-[0.24px]">
                          Expires in {daysUntilExpiry} days
                        </span>
                      </div>
                    )}
                  </div>

                  <button type="button" className="size-[24px] text-[#d9d9d9]">
                    <MoreHorizontal className="size-full" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-[32px] flex h-[56px] items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            className="relative size-[32px] shrink-0 text-[#d3d3d3]"
          >
            <ChevronLeft className="size-full" />
          </button>
          <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px] bg-[#e5f7ff]">
            <span className="font-medium font-sans text-[#0080bc] text-[12px] leading-[normal]">
              1
            </span>
          </div>
          {activeTab === 'myNames' && (
            <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px]">
              <span className="font-sans text-[#bcbcbc] text-[12px] leading-[normal]">
                2
              </span>
            </div>
          )}
          {activeTab === 'favorites' && (
            <>
              <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px]">
                <span className="font-sans text-[#bcbcbc] text-[12px] leading-[normal]">
                  2
                </span>
              </div>
              <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px]">
                <span className="font-sans text-[#bcbcbc] text-[12px] leading-[normal]">
                  3
                </span>
              </div>
              <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px]">
                <span className="font-sans text-[#bcbcbc] text-[12px] leading-[normal]">
                  ...
                </span>
              </div>
              <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px]">
                <span className="font-sans text-[#bcbcbc] text-[12px] leading-[normal]">
                  32
                </span>
              </div>
            </>
          )}
          <button
            type="button"
            className="relative size-[32px] shrink-0 text-[#d3d3d3]"
          >
            <ChevronRight className="size-full" />
          </button>
        </div>
        <span className="font-sans text-[#7d7d7d] text-[12px] leading-[1.2] tracking-[0.12px]">
          Showing 1-{Math.min(5, displayNames.length)} of{' '}
          {activeTab === 'favorites' ? 105 : displayNames.length}
        </span>
      </div>
    </div>
  )
}

export const FavoritesCard = () => null
