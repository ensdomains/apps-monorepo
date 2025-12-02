import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MoreHorizontal,
} from 'lucide-react'
import type { DashboardNameRow } from '@/features/dashboard/MOCK'

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

interface MyNamesListProps {
  names?: DashboardNameRow[]
}

export const MyNamesList = ({ names = [] }: MyNamesListProps) => {
  return (
    <div className="w-full">
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

      <div className="mb-[16px] flex h-[32px] items-center gap-[12px]">
        <div className="size-[12px] rounded-[3px] border-[#7d7d7d] border-[0.41px]" />
        <span className="font-sans text-[#232222] text-[14px] tracking-[0.28px]">
          Select all
        </span>
      </div>

      <div className="flex w-full flex-col">
        {names.map((name) => {
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
          <div className="flex size-[32px] shrink-0 items-center justify-center rounded-[6px]">
            <span className="font-sans text-[#bcbcbc] text-[12px] leading-[normal]">
              2
            </span>
          </div>
          <button
            type="button"
            className="relative size-[32px] shrink-0 text-[#d3d3d3]"
          >
            <ChevronRight className="size-full" />
          </button>
        </div>
        <span className="font-sans text-[#7d7d7d] text-[12px] leading-[1.2] tracking-[0.12px]">
          Showing 1-{Math.min(5, names.length)} of {names.length}
        </span>
      </div>
    </div>
  )
}
