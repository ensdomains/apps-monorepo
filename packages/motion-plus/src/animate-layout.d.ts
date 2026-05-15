import { ElementOrSelector, AnimationOptions, LayoutAnimationBuilder } from 'motion';

declare function unstable_animateLayout(scopeOrUpdateDom: ElementOrSelector | (() => void), updateDomOrOptions?: (() => void) | AnimationOptions, options?: AnimationOptions): LayoutAnimationBuilder;

export { unstable_animateLayout };
