import { Link } from '@tanstack/react-router'
import { Calendar, Wallet } from 'lucide-react'
import { CopyToClipboard } from '@/components/atoms/CopyToClipboard'
import { Highlight } from '@/components/atoms/Highlight'

interface ProfileHeaderInfoProps {
  name: string
  ownerNode: React.ReactNode
}

export const ProfileHeaderInfo = ({
  name,
  ownerNode,
}: ProfileHeaderInfoProps) => {
  return (
    <>
      <Highlight className="text-lg md:text-2xl">{name}</Highlight>
      <div className="flex items-center gap-x-2 whitespace-pre-wrap">
        <Wallet className="size-5" />
        Owned by {ownerNode}
      </div>
      <div className="flex items-center gap-x-2 whitespace-pre-wrap">
        <Calendar className="size-5" />
        Expires <span className="font-medium">August 15, 2026</span>
      </div>
      <div className="flex items-center gap-x-2">
        <Link
          to="/p/$name"
          params={{ name }}
          className="underline underline-offset-2"
        >
          app.ens.domains/p/{name}
        </Link>
        <CopyToClipboard
          value={`app.ens.domains/p/${name}`}
          className="size-4"
        />
      </div>
    </>
  )
}
