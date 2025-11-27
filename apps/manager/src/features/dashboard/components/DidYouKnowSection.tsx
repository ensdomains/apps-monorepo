import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export const DidYouKnowSection = () => (
  <Card className="border-[#dededf] border-[0.25px] bg-white/90 shadow-[0px_4px_6px_rgba(0,0,0,0.07)]">
    <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
      <div className="space-y-1">
        <CardTitle className="font-semibold font-serif text-[#232222] text-[32px]">
          Did You Know?
        </CardTitle>
        <CardDescription className="max-w-xl text-[#8c8c8c] text-sm">
          ENS names are more than just .eth usernames. Use them across apps,
          networks, and wallets.
        </CardDescription>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-medium text-[#8c8c8c] text-xs uppercase tracking-wide">
          2 of 10
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full border border-[#dededf] bg-white/70 shadow-none hover:bg-[#dededf]/60"
            aria-label="Previous tip"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full border border-[#dededf] bg-white/70 shadow-none hover:bg-[#dededf]/60"
            aria-label="Next tip"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col justify-between rounded-2xl bg-[#d3f0de] p-6 pb-7 md:p-8">
        <div className="space-y-3">
          <div className="text-[#065f46]">
            <p className="font-semibold text-2xl md:text-3xl">One username</p>
            <p className="font-serif text-xl italic md:text-2xl">everywhere.</p>
          </div>
          <p className="max-w-md text-[#065f46]/80 text-sm leading-relaxed">
            Your name lives onchain — you own it, not a platform. Sign in to
            web3 apps with your <span className="font-semibold">.eth name</span>{' '}
            and your ENS profile will load automatically.
          </p>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-2xl bg-[#ffd3ea] p-6 pb-7 md:p-8">
        <div className="space-y-3">
          <div className="text-[#c2185b]">
            <p className="font-semibold text-2xl md:text-3xl">
              Verify authenticity
            </p>
            <p className="font-serif text-xl italic md:text-2xl">
              and stay safe.
            </p>
          </div>
          <p className="max-w-md text-[#7a1040] text-sm leading-relaxed">
            Companies and projects use ENS because it's secured with ethereum,
            so you can be sure it's the real deal. Avoid impersonation scams and
            stay safe out there &lt;3.
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
)
