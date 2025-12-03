import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Search,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { DashboardNameRow } from '@/features/dashboard/MOCK'

interface FavoritesListProps {
  favorites?: DashboardNameRow[]
}

export const FavoritesList = ({ favorites = [] }: FavoritesListProps) => {
  return (
    <div className="w-full">
      <div className="mb-[20px] flex flex-col gap-4 md:gap-[20px]">
        <div className="w-full md:w-[292px]">
          <Input
            size="sm"
            placeholder="Search name..."
            startIcon={<Search className="size-[18px] text-[#8c8c8c]" />}
            className="h-[32px] rounded-[4.1px] border-none bg-[#f6f6f6] text-[#8c8c8c] text-[13.12px] placeholder:text-[#8c8c8c]"
          />
        </div>
      </div>

      <div className="box-border flex w-full flex-col gap-3 py-[4px] pr-0 pl-4 md:flex-row md:items-center md:justify-between md:pl-[28px]">
        <div className="flex items-center gap-[8px]">
          <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.24px]">
            Name
          </span>
          <div className="flex flex-col">
            <ChevronDown className="size-[8.2px] rotate-180 text-[#7d7d7d]" />
            <ChevronDown className="size-[8.2px] text-[#7d7d7d]" />
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-[6px] md:w-[189px]">
          <span className="font-sans text-[#7d7d7d] text-[11px] tracking-[0.22px] md:text-[12px] md:tracking-[0.24px]">
            Receive expiry notifications
          </span>
          <Switch className="h-[16.09px] w-[28px] shrink-0 data-[state=checked]:bg-[#0f172b]" />
        </div>
      </div>

      <div className="flex w-full flex-col">
        {favorites.map((name) => (
          <div
            key={name.id}
            className="box-border flex h-[64px] flex-col items-start justify-center gap-[16px] border-[lightgrey] border-t-0 border-r-0 border-b-[0.41px] border-l-0 px-0 py-[24px] last:border-b-0"
          >
            <div className="flex w-full items-center">
              <div className="flex w-full items-center gap-3 md:w-[300px] md:gap-[25px]">
                <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-[12px]">
                  <Heart className="size-[14px] shrink-0 fill-[#ed5499] text-[#ed5499] md:size-[16px]" />
                  <div className="relative size-[32px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6] md:size-[36.9px]">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-200 to-blue-200" />
                  </div>
                  <div className="flex shrink-0 items-center justify-center rounded-[2.867px] bg-[#e5f7ff] px-2 py-1 md:h-[24px] md:px-[8px] md:py-[4px]">
                    <Link
                      to="/p/$name"
                      params={{ name: name.name }}
                      className="mr-1 truncate font-medium font-mono text-[#0080bc] text-[14px] leading-[0.96] tracking-[-0.28px] md:mr-2 md:text-[16px] md:tracking-[-0.32px]"
                    >
                      {name.name}
                    </Link>
                    <ArrowUpRight
                      className="size-[6px] shrink-0 text-[#0080bc] md:size-[7px]"
                      strokeWidth={3}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-center gap-2 overflow-x-auto md:gap-[12px]">
          <button
            type="button"
            className="relative size-[28px] shrink-0 text-[#d3d3d3] md:size-[32px]"
          >
            <ChevronLeft className="size-full" />
          </button>
          <div className="flex size-[28px] shrink-0 items-center justify-center rounded-[6px] bg-[#e5f7ff] md:size-[32px]">
            <span className="font-medium font-sans text-[#0080bc] text-[11px] leading-[normal] md:text-[12px]">
              1
            </span>
          </div>
          <div className="hidden size-[28px] shrink-0 items-center justify-center rounded-[6px] md:flex md:size-[32px]">
            <span className="font-sans text-[#bcbcbc] text-[11px] leading-[normal] md:text-[12px]">
              2
            </span>
          </div>
          <div className="hidden size-[28px] shrink-0 items-center justify-center rounded-[6px] md:flex md:size-[32px]">
            <span className="font-sans text-[#bcbcbc] text-[11px] leading-[normal] md:text-[12px]">
              3
            </span>
          </div>
          <div className="hidden size-[28px] shrink-0 items-center justify-center rounded-[6px] md:flex md:size-[32px]">
            <span className="font-sans text-[#bcbcbc] text-[11px] leading-[normal] md:text-[12px]">
              ...
            </span>
          </div>
          <div className="hidden size-[28px] shrink-0 items-center justify-center rounded-[6px] md:flex md:size-[32px]">
            <span className="font-sans text-[#bcbcbc] text-[11px] leading-[normal] md:text-[12px]">
              32
            </span>
          </div>
          <button
            type="button"
            className="relative size-[28px] shrink-0 text-[#d3d3d3] md:size-[32px]"
          >
            <ChevronRight className="size-full" />
          </button>
        </div>
        <span className="text-center font-sans text-[#7d7d7d] text-[11px] leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
          Showing 1-{Math.min(5, favorites.length)} of {favorites.length}
        </span>
      </div>
    </div>
  )
}
