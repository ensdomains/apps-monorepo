import { useTransform } from 'motion/react';

function useOffset(position, offset) {
    return {
        x: useTransform(() => position.x.get() + offset.x),
        y: useTransform(() => position.y.get() + offset.y),
    };
}

export { useOffset };
