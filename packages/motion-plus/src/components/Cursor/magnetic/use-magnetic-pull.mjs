import { useMotionValue, animate, useTransform, mix } from 'motion/react';
import { useMemo, useEffect } from 'react';
import { useCursorState } from '../hooks/use-cursor-state/index.mjs';
import { usePointerPosition } from '../hooks/use-pointer-position.mjs';

function useOffset(pointer, pull, target) {
    const rest = useMotionValue(0);
    const offset = useMotionValue(0);
    const crossfade = useMotionValue(0);
    useEffect(() => {
        if (typeof target === "number") {
            animate(crossfade, 1);
            const updateOffset = () => {
                offset.set(pull * (pointer.get() - target));
            };
            updateOffset();
            return pointer.on("change", updateOffset);
        }
        else {
            animate(crossfade, 0);
        }
    }, [target]);
    return useTransform(() => mix(rest.get(), offset.get(), crossfade.get()));
}
function useMagneticPull(ref, pull = 0.1) {
    const state = useCursorState();
    const pointer = usePointerPosition();
    const isActive = useMemo(() => {
        return state.targetBoundingBox && state.target === ref.current;
    }, [state.targetBoundingBox, state.target, ref.current]);
    const x = useOffset(pointer.x, pull, isActive
        ? state.targetBoundingBox.left + state.targetBoundingBox.width / 2
        : undefined);
    const y = useOffset(pointer.y, pull, isActive
        ? state.targetBoundingBox.top + state.targetBoundingBox.height / 2
        : undefined);
    return { x, y };
}

export { useMagneticPull };
