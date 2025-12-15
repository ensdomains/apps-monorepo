import { LinkButton } from '@/components/ui/button'

export const NotFoundPage = () => {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="font-medium text-gray-500 text-sm">404</p>
      <h1 className="font-semibold text-2xl text-gray-900">Page not found</h1>
      <p className="text-gray-600 text-sm">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved.
      </p>
      <div className="mt-4">
        <LinkButton to="/" variant="secondary">
          Go back home
        </LinkButton>
      </div>
    </div>
  )
}
