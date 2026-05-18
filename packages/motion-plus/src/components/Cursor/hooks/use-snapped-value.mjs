import { useSpring, useMotionValue, useIsomorphicLayoutEffect, animate } from 'motion/react';
import { useRef } from 'react';
import { useMixed } from './use-mixed.mjs';

function useSnappedValue(pointer, snap, target) {
    const snapped = useSpring(0, {
        stiffness: 600,
        damping: 50,
    });
    const crossfade = useMotionValue(0);
    const mixed = useMixed(pointer, snapped, crossfade);
    const prevTarget = useRef(target);
    useIsomorphicLayoutEffect(() => {
        if (target) {
            if (!prevTarget.current && !crossfade.isAnimating()) {
                snapped.jump(target);
            }
            else {
                snapped.set(target);
            }
            animate(crossfade, snap);
        }
        else {
            animate(crossfade, 0);
        }
        prevTarget.current = target;
    }, [target]);
    return mixed;
}

export { useSnappedValue };
