import { Card } from '@/components/ui/card'

export const DashboardLoading = () => {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-4 px-4 py-6 md:flex-row md:gap-8 md:px-[58px] md:py-[40px]">
      <div className="hidden w-[300px] shrink-0 lg:block">
        <Card className="h-[260px] animate-pulse rounded-[8px] border-[#dededf] border-[0.25px] bg-white" />
      </div>
      <div className="min-w-0 flex-1 space-y-6 md:space-y-8">
        <div className="space-y-4 md:space-y-8">
          <div className="h-[32px] w-[220px] animate-pulse rounded bg-[#e5f7ff]" />
          <div className="h-[40px] w-[320px] animate-pulse rounded bg-[#f0f0f0]" />
        </div>
        <Card className="h-[260px] animate-pulse rounded-[8px] border-[#dededf] border-[0.25px] bg-white" />
        <Card className="h-[320px] animate-pulse rounded-[8px] border-[#dededf] border-[0.25px] bg-white" />
      </div>
    </div>
  )
}
