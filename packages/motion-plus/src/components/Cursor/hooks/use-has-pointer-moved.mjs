import { pipe } from 'motion/react';
import { useState, useInsertionEffect } from 'react';

function useHasPointerMoved({ x, y, }, resetSpring) {
    const [pointerHasMoved, setPointerHasMoved] = useState(x.prev !== undefined || y.prev !== undefined);
    useInsertionEffect(() => {
        if (pointerHasMoved)
            return;
        const setHasMoved = () => {
            setPointerHasMoved(true);
            resetSpring();
            stop();
        };
        const stop = pipe(x.on("change", setHasMoved), y.on("change", setHasMoved));
        return () => stop();
    }, [x, y, pointerHasMoved]);
    return pointerHasMoved;
}

export { useHasPointerMoved };
