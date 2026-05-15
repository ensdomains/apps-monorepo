import { useSnappedValue } from '../hooks/use-snapped-value.mjs';

function useMagneticTarget(pointer, isEnabled, state, snap) {
    const x = useSnappedValue(pointer.x, snap, state.targetBoundingBox
        ? state.targetBoundingBox.left + state.targetBoundingBox.width / 2
        : undefined);
    const y = useSnappedValue(pointer.y, snap, state.targetBoundingBox
        ? state.targetBoundingBox.top + state.targetBoundingBox.height / 2
        : undefined);
    return isEnabled ? { x, y } : pointer;
}

export { useMagneticTarget };
