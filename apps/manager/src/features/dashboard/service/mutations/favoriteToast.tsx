import { i18n } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { toast } from 'sonner'
import { MSymbol } from '@/components/ui/material-symbol'

const favoriteAddedToastMessage = msg`Added to your favorites!`

const getFavoriteAddedToastCopy = () =>
  i18n.locale
    ? i18n._(favoriteAddedToastMessage)
    : favoriteAddedToastMessage.message

export const showFavoriteAddedToast = () => {
  const message = getFavoriteAddedToastCopy()

  toast.custom(
    () => (
      <div className="flex max-w-[calc(100vw-32px)] items-center gap-2 rounded-[6px] bg-[#ffeef3] px-4 py-3.5 text-ens-signal-danger-600 shadow-[0px_2px_6px_rgba(0,0,0,0.06)]">
        <MSymbol
          aria-hidden="true"
          className="ms-fill ms-opsz-24 ms-wght-400 size-6 shrink-0 text-[24px] leading-none"
          symbol="favorite"
        />
        <span className="whitespace-nowrap text-base leading-[1.05] tracking-[0.02em]">
          {message}
        </span>
      </div>
    ),
    { id: 'favorite-added-toast', position: 'bottom-right' },
  )
}
