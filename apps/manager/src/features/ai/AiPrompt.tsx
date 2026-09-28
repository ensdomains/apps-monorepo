import { Trans, useLingui } from '@lingui/react/macro'
import { ArrowUp, Loader2 } from 'lucide-react'
import { type FormEvent, useRef } from 'react'

const suggestions = [
  { label: 'Names in grace', prompt: 'List all grace period names' },
  { label: 'Edit a profile', prompt: 'Edit my profile' },
  { label: 'Set a primary name', prompt: 'Set my primary name' },
] as const

export const AiPrompt = ({
  prompt,
  isPending,
  isAuthenticated,
  onChange,
  onSubmit,
}: {
  readonly prompt: string
  readonly isPending: boolean
  readonly isAuthenticated: boolean
  readonly onChange: (value: string) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) => {
  const { t } = useLingui()
  const input = useRef<HTMLTextAreaElement>(null)

  return (
    <section className="relative z-10 mx-auto flex w-full max-w-190 flex-col items-center">
      <img
        alt=""
        className="pointer-events-none mb-4 size-20 select-none object-contain sm:mb-5 sm:size-24"
        draggable={false}
        height={256}
        src="/frens/ai-helper.webp"
        width={256}
      />
      <div className="mb-7 text-center md:mb-8">
        <h1 className="text-[32px] text-ens-lapis-900 leading-[1.1] tracking-[-0.64px] md:text-[36px] md:tracking-[-0.72px]">
          <Trans>What’s next for your names?</Trans>
        </h1>
      </div>
      <form
        className="group relative isolate w-full rounded-[20px] bg-linear-to-br from-ens-lapis-400 via-[#b7a8ef] to-ens-garnet-200 p-px transition-shadow duration-200 focus-within:ring-2 focus-within:ring-ens-lapis-500/35 motion-reduce:transition-none"
        onSubmit={onSubmit}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 -z-10 rounded-3xl bg-linear-to-br from-ens-lapis-400 via-[#b7a8ef] to-ens-garnet-200 opacity-40 blur-xl transition-opacity duration-300 group-focus-within:opacity-65 motion-reduce:transition-none"
        />
        <div className="relative rounded-[19px] bg-ens-lapis-bg p-4 sm:p-5">
          <label className="sr-only" htmlFor="ai-prompt">
            <Trans>Your request</Trans>
          </label>
          <textarea
            aria-describedby="ai-prompt-guidance"
            autoComplete="off"
            className="min-h-24 w-full resize-none border-0 bg-transparent px-1 py-2 font-sans text-ens-lapis-900 text-lg leading-relaxed outline-none placeholder:text-ens-lapis-900/45 sm:min-h-28 sm:text-xl"
            id="ai-prompt"
            maxLength={160}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={t`Ask about your names, or make a change…`}
            ref={input}
            rows={3}
            value={prompt}
          />
          <div className="flex items-center justify-between gap-4 pl-1">
            <span
              className="text-ens-lapis-900/60 text-xs"
              id="ai-prompt-guidance"
            >
              <Trans>You review every change.</Trans>
            </span>
            <button
              aria-label={t`Send request`}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/40 border-t-2 bg-ens-lapis-900 text-white shadow-[2px_-2px_0_var(--color-ens-lapis-300),inset_2px_-2px_0_var(--color-ens-lapis-500)] transition duration-150 hover:bg-ens-lapis-dense focus-visible:outline-2 focus-visible:outline-ens-lapis-900 focus-visible:outline-offset-4 active:translate-y-px disabled:bg-ens-lapis-900/10 disabled:text-ens-lapis-900/35 disabled:shadow-none motion-reduce:transition-none"
              disabled={!prompt.trim() || isPending || !isAuthenticated}
              type="submit"
            >
              {isPending ? (
                <Loader2
                  aria-hidden="true"
                  className="size-5 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <ArrowUp
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={2}
                />
              )}
            </button>
          </div>
        </div>
      </form>
      <div className="relative mt-5 flex flex-wrap justify-center gap-x-2 gap-y-2 sm:gap-x-3">
        {suggestions.map(({ label, prompt: example }) => (
          <button
            className="rounded-lg border border-ens-lapis-900/10 bg-white/25 px-3.5 py-2 text-ens-lapis-900/75 text-xs transition-colors hover:border-ens-lapis-900/20 hover:bg-white/50 hover:text-ens-lapis-900 focus-visible:outline-2 focus-visible:outline-ens-lapis-900 focus-visible:outline-offset-2 sm:text-sm"
            key={label}
            onClick={() => {
              onChange(example)
              input.current?.focus()
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
