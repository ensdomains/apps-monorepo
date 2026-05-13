import { getViewAnimations, getViewAnimationLayerInfo, getValueTransition, applyGeneratorOptions, mapEasingToNativeEasing, NativeAnimationWrapper, GroupAnimation, NativeAnimation } from 'motion-dom';
import { secondsToMilliseconds } from 'motion-utils';
import { sharedProps } from './animate-view4.mjs';

function createViewAnimation(animationType, commitProps) {
    return ({ name }, types) => {
        const { transition, onAnimationStart, onAnimationComplete, ...props } = sharedProps.get(name) || commitProps;
        const layerAnimations = [];
        const generatedViewAnimations = getViewAnimations();
        for (const viewAnimation of generatedViewAnimations) {
            if (viewAnimation.playState === "finished")
                continue;
            const { effect } = viewAnimation;
            if (!effect || !(effect instanceof KeyframeEffect))
                continue;
            const { pseudoElement } = effect;
            if (!pseudoElement)
                continue;
            const info = getViewAnimationLayerInfo(pseudoElement);
            if (!info || info.layer !== name)
                continue;
            const transitionName = info.type === "group" ? "layout" : "";
            const { transition: typeTransition, ...values } = typeof props[animationType] === "function"
                ? props[animationType](types)
                : props[animationType] || {};
            if (Object.keys(values).length > 0) {
                // Custom values defined — cancel browser's default cross-fade
                // and replace with our own animations
                viewAnimation.cancel();
                layerAnimations.push(...createViewAnimations(name, animationType, values, transition, typeTransition));
            }
            else {
                // No custom values — keep browser animation but apply Motion timing
                let animationOptions = {
                    ...getValueTransition(transition, transitionName),
                    ...getValueTransition(typeTransition, transitionName),
                };
                animationOptions.duration = secondsToMilliseconds(animationOptions.duration ?? 0.3);
                animationOptions = applyGeneratorOptions(animationOptions);
                const easing = mapEasingToNativeEasing(animationOptions.ease, animationOptions.duration);
                effect.updateTiming({
                    delay: secondsToMilliseconds(animationOptions.delay ?? 0),
                    duration: animationOptions.duration,
                    easing,
                });
                layerAnimations.push(new NativeAnimationWrapper(viewAnimation));
            }
        }
        const animation = new GroupAnimation(layerAnimations);
        onAnimationStart?.(animation, animationType);
        if (onAnimationComplete) {
            animation.finished.then(() => {
                onAnimationComplete(animationType);
            });
        }
    };
}
function createViewAnimations(layerName, animationType, values, defaultTransition, transition) {
    const animations = [];
    for (let [name, keyframes] of Object.entries(values)) {
        const options = {
            ...getValueTransition(defaultTransition, name),
            ...getValueTransition(transition, name),
        };
        options.duration && (options.duration = secondsToMilliseconds(options.duration));
        options.delay && (options.delay = secondsToMilliseconds(options.delay));
        if (name === "opacity" && !Array.isArray(keyframes)) {
            const initialValue = animationType === "enter" ? 0 : 1;
            keyframes = [initialValue, keyframes];
        }
        const animation = new NativeAnimation({
            ...options,
            element: document.documentElement,
            name,
            pseudoElement: `::view-transition-${animationType === "enter" ? "new" : "old"}(${layerName})`,
            keyframes,
        });
        animations.push(animation);
    }
    return animations;
}

export { createViewAnimation };
