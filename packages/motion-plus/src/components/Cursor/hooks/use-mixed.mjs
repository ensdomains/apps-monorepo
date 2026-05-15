import { useTransform, mix } from 'motion/react';

function useMixed(a, b, p) {
    return useTransform(() => mix(a.get(), b.get(), p.get()));
}

export { useMixed };
