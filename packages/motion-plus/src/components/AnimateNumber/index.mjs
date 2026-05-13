"use client";
import { jsx, jsxs } from 'react/jsx-runtime';
import { MotionConfigContext, MotionConfig, motion, easeOut } from 'motion/react';
import { forwardRef, useMemo, useContext, useRef } from 'react';
import { maskHeight, Mask } from './Mask.mjs';
import { NumberSection } from './NumberSection.mjs';
import { formatToParts } from './utils/format-parts.mjs';

const DEFAULT_TRANSITION = {
    opacity: { duration: 1, ease: easeOut }, // perceptual duration of 0.5s
    y: { type: "spring", duration: 1, bounce: 0 },
    width: { type: "spring", duration: 1, bounce: 0 },
};
const AnimateNumber = forwardRef(function AnimateNumber({ children: value, locales, format, transition, style, suffix, prefix, trend, ...rest }, ref) {
    // Split the number into parts
    const parts = useMemo(() => formatToParts(value, { locales, format }, prefix, suffix), [value, locales, format]);
    const { pre, integer, fraction, post, formatted } = parts;
    const contextTransition = useContext(MotionConfigContext).transition;
    transition = transition ?? contextTransition ?? DEFAULT_TRANSITION;
    // Track previous value for trend computation
    const numericValue = typeof value === "string" ? parseFloat(value) : Number(value);
    const prevValueRef = useRef(numericValue);
    const prevValue = prevValueRef.current;
    prevValueRef.current = numericValue;
    // Resolve trend direction
    let resolvedTrend;
    if (typeof trend === "function") {
        resolvedTrend = trend(prevValue, numericValue);
    }
    else if (trend !== undefined) {
        resolvedTrend = trend;
    }
    else {
        resolvedTrend = Math.sign(numericValue - prevValue);
    }
    return (jsx(MotionConfig, { transition: transition, children: jsx(motion.span, { ...rest, ref: ref, style: {
                lineHeight: 1, // make this one easy to override
                ...style,
                display: "inline-flex",
                isolation: "isolate", // so number can be underneath first/last
                whiteSpace: "nowrap",
            }, children: jsxs("span", { "aria-label": formatted, style: {
                    display: "inline-flex",
                    direction: "ltr", // I think this is needed b/c numbers are always LTR?
                    isolation: "isolate", // so number can be underneath pre/post
                    position: "relative",
                    zIndex: -1, // so the whole number is under any first/last
                }, children: [jsx(NumberSection, { style: { padding: `calc(${maskHeight}/2) 0` }, "aria-hidden": true, justify: "right", mode: "popLayout", parts: pre, name: "pre", trend: resolvedTrend }), jsxs(Mask, { children: [jsx(NumberSection, { justify: "right", parts: integer, name: "integer", trend: resolvedTrend }), jsx(NumberSection, { parts: fraction, name: "fraction", trend: resolvedTrend })] }), jsx(NumberSection, { style: { padding: `calc(${maskHeight}/2) 0` }, "aria-hidden": true, mode: "popLayout", parts: post, name: "post", trend: resolvedTrend })] }) }) }));
});

export { AnimateNumber, DEFAULT_TRANSITION };
