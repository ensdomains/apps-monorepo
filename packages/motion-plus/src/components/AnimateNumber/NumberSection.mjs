"use client";
import { jsx, jsxs } from 'react/jsx-runtime';
import { MotionConfigContext, animate, AnimatePresence } from 'motion/react';
import { forwardRef, useRef, useImperativeHandle, useMemo, useContext, useEffect } from 'react';
import { useIsInitialRender } from './hooks/use-is-initial-render.mjs';
import { NumberDigit } from './NumberDigit.mjs';
import { NumberSymbol } from './NumberSymbol.mjs';
import { SectionContext } from './SectionContext.mjs';
import { getWidthInEm } from './utils/get-width-in-ems.mjs';
import { targetWidths } from './utils/target-widths.mjs';

const NumberSection = forwardRef(function NumberSection({ parts, justify = "left", mode, style, name, trend, ...rest }, _ref) {
    const ref = useRef(null);
    useImperativeHandle(_ref, () => ref.current, []);
    const context = useMemo(() => ({ justify }), [justify]);
    const measuredRef = useRef(null);
    const isInitialRender = useIsInitialRender();
    const { transition } = useContext(MotionConfigContext);
    // Keep a fixed width for the section, so that new characters get added to the end before the
    // width animation starts, which makes them look like they were there already:
    useEffect(() => {
        if (!measuredRef.current || !ref.current)
            return;
        if (isInitialRender) {
            ref.current.style.width = getWidthInEm(measuredRef.current);
            return;
        }
        // Find the new width by removing exiting elements, measuring the measuredRef, and re-adding them
        // This better handles i.e. negative margins between elements.
        // We query the DOM because AnimatePresence overwrites ref props if the mode=popLayout
        const undos = Array.from(measuredRef.current.children).map((child) => {
            if (!(child instanceof HTMLElement))
                return;
            if (child.dataset.state === "exiting") {
                const next = child.nextSibling;
                child.remove();
                return () => {
                    // insertBefore() appends if next is null:
                    if (measuredRef.current) {
                        measuredRef.current.insertBefore(child, next);
                    }
                };
            }
            const newWidth = targetWidths.get(child);
            if (!newWidth)
                return;
            const oldWidth = child.style.width;
            child.style.width = newWidth;
            return () => {
                child.style.width = oldWidth;
            };
        });
        // Measure the resulting width:
        const newWidth = getWidthInEm(measuredRef.current);
        // Then undo immediately:
        for (let i = undos.length - 1; i >= 0; i--) {
            const undo = undos[i];
            if (undo)
                undo();
        }
        // Animate to the new width:
        animate(ref.current, { width: newWidth }, transition);
    }, [parts.map((p) => p.value).join("")]);
    return (jsx(SectionContext.Provider, { value: context, children: jsx("span", { ...rest, ref: ref, className: `number-section-${name}`, style: {
                ...style,
                display: "inline-flex",
                justifyContent: justify,
            }, children: jsxs("span", { ref: measuredRef, style: {
                    display: "inline-flex",
                    justifyContent: "inherit",
                    position: "relative", // needed for AnimatePresent popLayout
                }, children: ["\u200B", jsx(AnimatePresence, { mode: mode, anchorX: justify, initial: false, children: parts.map((part) => part.type === "integer" ||
                            part.type === "fraction" ? (jsx(NumberDigit, { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, value: part.value, initialValue: isInitialRender ? undefined : 0, trend: trend }, part.key)) : (jsx(NumberSymbol, { type: part.type, partKey: part.key, initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, children: part.value }, part.type === "literal"
                            ? `${part.key}:${part.value}`
                            : part.key))) })] }) }) }));
});

export { NumberSection };
