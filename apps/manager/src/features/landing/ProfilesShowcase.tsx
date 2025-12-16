import { GithubIcon, GlobeIcon, MailIcon, TwitterIcon } from 'lucide-react'
import erniAvatar from '@/assets/pages/landing/erni.webp'
import nickAvatar from '@/assets/pages/landing/nick.webp'
import vitalikAvatar from '@/assets/pages/landing/vitalik.webp'
import { ProfileCard } from './components/ProfileCard'

export const ProfilesShowcase = () => {
  return (
    <div className="mx-auto mt-20 mb-28 w-full-[4rem] max-w-6xl">
      <div className="space-y-6">
        <h2 className="max-w-md font-medium text-ens-lapis-core text-temp-32px leading-ens-none">
          Customize your profile to share what matters
        </h2>
        <p className="max-w-md font-serif text-lg leading-ens-normal">
          Your ENS name is your onchain identity. Personalize it with an avatar,
          a banner, and the links that matter most. Showcase your work, connect
          your socials, and make it easy for anyone to verify and follow you
          across the web.
        </p>
      </div>

      <div className="mt-20 flex gap-11 max-md:flex-col">
        <ProfileCard
          name="vitalik.eth"
          avatarUrl={vitalikAvatar}
          registeredDate={new Date('2020-02-06')}
          description="mi pinxe lo crino tcati"
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/vitalikbuterin',
              title: '@VitalikButerin',
            },
            {
              icon: <GithubIcon className="size-full" />,
              href: 'https://github.com/vbuterin',
              title: 'vButerin',
            },
            {
              icon: <GlobeIcon className="size-full" />,
              href: 'https://vitalik.eth.limo',
              title: 'vitalik.eth.limo',
            },
          ]}
          variant="peridot"
          delay={0}
        />
        <ProfileCard
          name="nick.eth"
          avatarUrl={nickAvatar}
          registeredDate={new Date('2020-02-04')}
          description="Lead developer of ENS & Ethereum Foundation alum. Certified rat tickler. he/him."
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/nicksdjohnson',
              title: '@nicksdjohnson',
            },
            {
              icon: <GithubIcon className="size-full" />,
              href: 'https://github.com/arachnid',
              title: 'arachnid',
            },
            {
              icon: <MailIcon className="size-full" />,
              href: 'mailto:arachnied@notdot',
              title: 'arachnied@notdot',
            },
          ]}
          variant="lapis"
          delay={0.05}
        />
        <ProfileCard
          name="erni.eth"
          avatarUrl={erniAvatar}
          registeredDate={new Date('2024-08-28')}
          description="A scrappy generalist builder with taste. Senior Product Designer and Researcher at ENS Labs, dedicated to making web3 feel straightforward to newcomers."
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/erni_eth',
              title: '@erni_eth',
            },
            {
              icon: <MailIcon className="size-full" />,
              href: 'mailto:myemail.me.com',
              title: 'myemail.me.com',
            },
          ]}
          variant="garnet"
          delay={0.1}
        />
      </div>
    </div>
  )
}
