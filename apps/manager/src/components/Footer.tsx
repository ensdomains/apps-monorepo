import { Link } from '@tanstack/react-router'

const LEGAL_LINKS = [
  {
    label: 'Terms of Use',
    to: '/legal/terms-of-use',
  },
  {
    label: 'Privacy Policy',
    to: '/legal/privacy-policy',
  },
  {
    label: 'Trademark Guidelines',
    to: '/legal/trademark-guidelines',
  },
] as const

export const Footer = () => {
  return (
    <footer className="border-gray-200 border-t bg-white px-4 py-6 md:px-10">
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm md:gap-6">
        {LEGAL_LINKS.map((link) => (
          <Link
            className="text-gray-500 transition-colors hover:text-gray-700 hover:underline"
            key={link.to}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
