import ensIcon from '@/assets/icons/ens-mobile.svg'
export const IntegrationsSection = () => {
  return (
    <div className="mt-20 bg-white">
      <div className="mx-auto w-full-[4rem] max-w-6xl py-20">
        <div className="space-y-6">
          <h2 className="font-medium text-ens-lapis-core text-temp-32px leading-ens-none">
            These are all the places you can you your ENS name.
          </h2>
          <p className="max-w-md font-serif text-lg leading-ens-normal">
            Lorem ipsum dolor sit amet consectetur, adipisicing elit. Iste quia
            ad corrupti quasi, libero commodi, adipisci a voluptas fuga
            exercitationem quis ipsum sapiente quos repellendus modi, sunt ullam
            eligendi architecto?
          </p>
        </div>

        <div className="mt-16 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 16 }).map((_, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
              key={index}
              className="flex items-center gap-2 border-ens-lapis-dust border-t py-4"
            >
              <img src={ensIcon} alt="ENS" className="size-10 object-cover" />
              <span className="font-medium text-base text-ens-blue-midnight md:text-lg lg:text-[22px]">
                ENS Domains
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
