declare const cn: (...classes: ReadonlyArray<string>) => string
export const Bare = () => <button type="button" className="outline-none" /> // expect: no-bare-outline-none
export const Paired = () => <button type="button" className="outline-none focus-visible:ring-2" />
export const Siblings = () => <input className={cn('outline-none', 'focus-visible:ring-2')} />
export const Within = () => <input className="outline-none focus-within:border-primary" />
export const Variant = () => <input className="focus:outline-none" /> // expect: no-bare-outline-none
export const ruleId = 'plugin/no-bare-outline-none'
