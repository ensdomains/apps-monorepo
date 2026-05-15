import { motionValue, frame } from 'motion/react';
import { onlyMouse } from './utils/only-mouse-events.mjs';

let x;
let y;
function initPointerTracking() {
    x = motionValue(0);
    y = motionValue(0);
    // Cached pointer
    let pointerX = 0;
    let pointerY = 0;
    function updatePointer() {
        x.set(pointerX);
        y.set(pointerY);
    }
    if (typeof window !== "undefined") {
        window.addEventListener("pointermove", onlyMouse((event) => {
            pointerX = event.clientX;
            pointerY = event.clientY;
            /**
             * Don't update pointer until the next render frame to
             * avoid
             *
             * TODO: Update motion values to cache rendered value
             * and use that in projection measurements
             * instead of using this approach
             */
            frame.update(updatePointer);
        }));
    }
}
function usePointerPosition() {
    if (!x)
        initPointerTracking();
    return { x: x, y: y };
}

export { usePointerPosition };
