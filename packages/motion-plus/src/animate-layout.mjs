import { parseAnimateLayoutArgs, LayoutAnimationBuilder } from 'motion';

function unstable_animateLayout(scopeOrUpdateDom, updateDomOrOptions, options) {
    const { scope, updateDom, defaultOptions } = parseAnimateLayoutArgs(scopeOrUpdateDom, updateDomOrOptions, options);
    return new LayoutAnimationBuilder(scope, updateDom, defaultOptions);
}

export { unstable_animateLayout };
