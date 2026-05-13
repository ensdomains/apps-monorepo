import { jsx, jsxs } from 'react/jsx-runtime';
import { MotionConfigContext, useIsPresent, animate, motion } from 'motion/react';
import { forwardRef, useContext, useRef, useImperativeHandle, useLayoutEffect, useEffect } from 'react';
import { useIsInitialRender } from './hooks/use-is-initial-render.mjs';
import { maskHeight } from './Mask.mjs';
import { getWidthInEm } from './utils/get-width-in-ems.mjs';
import { targetWidths } from './utils/target-widths.mjs';

function mod(n, m) {
    return ((n % m) + m) % m;
}
const NumberDigit = forwardRef(function NumberDigit({ value: _value, initialValue: _initialValue = _value, trend = 0, ...rest }, _ref) {
    const { transition } = useContext(MotionConfigContext);
    const initialValue = useRef(_initialValue).current; // non-reactive, like React's defaultValue props
    const isInitialRender = useIsInitialRender();
    const scope = useRef(null);
    const ref = useRef(null);
    useImperativeHandle(_ref, () => ref.current, []);
    const numberRefs = useRef(new Array(10));
    // Don't use a normal exit animation for this because we want it to trigger a resize:
    const isPresent = useIsPresent();
    const value = isPresent ? _value : 0;
    // Set the width to the width of the initial value immediately, so on the next render we animate from that:
    useLayoutEffect(() => {
        if (!scope.current || !numberRefs.current[initialValue])
            return;
        scope.current.style.width = getWidthInEm(numberRefs.current[initialValue]);
    }, []);
    // Animate the y in a layout effect, because it's a FLIP
    const prevValue = useRef(_initialValue);
    useLayoutEffect(() => {
        if (!scope.current || value === prevValue.current)
            return;
        const box = scope.current.getBoundingClientRect();
        const refBox = ref.current?.getBoundingClientRect();
        // Compute the trend-aware delta for wrapping
        const oldVal = prevValue.current;
        let delta = value - oldVal;
        if (trend > 0 && value < oldVal) {
            // Force upward: wrap through 10
            delta = 10 - oldVal + value;
        }
        else if (trend < 0 && value > oldVal) {
            // Force downward: wrap through 0
            delta = value - 10 - oldVal;
        }
        // Using a number seems to ensure Motion ends with "none", which we want:
        // Add the offset between the top of the inner and outer elements to account for
        // any current animation state:
        const initialY = box.height * delta +
            (box.top - (refBox ? refBox.top || 0 : box.top));
        animate(scope.current, { y: [initialY, 0] }, transition);
        return () => {
            prevValue.current = value;
        };
    }, [value]);
    // Animate width
    useEffect(() => {
        // Skip setting the width if this is the first render and it's not going to animate:
        if (isInitialRender && initialValue === value)
            return;
        if (!numberRefs.current[value])
            return;
        const w = getWidthInEm(numberRefs.current[value]);
        // Store the target width immediately, so it can be used for the section resize:
        if (ref.current)
            targetWidths.set(ref.current, w);
        // Animate to the new width:
        if (ref.current) {
            animate(ref.current, { width: w }, transition);
        }
    }, [value]);
    const renderNumber = (i) => (jsx("span", { style: {
            display: "inline-block",
            padding: `calc(${maskHeight}/2) 0`,
        }, ref: (r) => void (numberRefs.current[i] = r), children: i }, i));
    // Render 9 digits above and 9 below the current value, wrapping mod 10.
    // This allows the FLIP animation to scroll in either direction through
    // the full digit cycle. The column is clipped by the parent overflow.
    const aboveDigits = [];
    const belowDigits = [];
    for (let offset = 9; offset >= 1; offset--) {
        aboveDigits.push(mod(value - offset, 10));
    }
    for (let offset = 1; offset <= 9; offset++) {
        belowDigits.push(mod(value + offset, 10));
    }
    return (jsx(motion.span, { ...rest, ref: ref, "data-state": isPresent ? undefined : "exiting", style: {
            display: "inline-flex",
            justifyContent: "center",
        }, children: jsxs("span", { ref: scope, style: {
                display: "inline-flex",
                justifyContent: "center",
                flexDirection: "column",
                alignItems: "center",
                position: "relative",
            }, children: [aboveDigits.length > 0 && (jsx("span", { style: {
                        ...digitFillStyle,
                        bottom: `100%`,
                        left: 0,
                    }, children: aboveDigits.map((d) => renderNumber(d)) })), renderNumber(value), belowDigits.length > 0 && (jsx("span", { style: {
                        ...digitFillStyle,
                        top: `100%`,
                        left: 0,
                    }, children: belowDigits.map((d) => renderNumber(d)) }))] }) }));
});
const digitFillStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "absolute",
    width: "100%",
};

export { NumberDigit };
