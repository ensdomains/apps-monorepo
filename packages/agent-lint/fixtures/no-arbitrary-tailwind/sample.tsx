export const Tile = () => <div className="w-[37px]" /> // expect: no-arbitrary-tailwind
export const Brand = () => <p className="text-[#3B82F6]" /> // expect: no-arbitrary-tailwind
export const Ring = () => <input className="focus-visible:ring-[3px]" /> // expect: no-arbitrary-tailwind
export const Grid = () => <div className="grid-cols-[auto_1fr]" />
export const Indent = () => <div className="[--detail-indent:36px]" />
export const Centre = () => <div className="top-[calc(50%-1px)]" />
export const Token = () => <div className="w-5.5" />
