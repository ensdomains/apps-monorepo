"use client";
import { jsx } from 'react/jsx-runtime';
import { scrambleText } from 'motion-plus-dom';
import { useMotionValue, useIsomorphicLayoutEffect, motion } from 'motion/react';
import { forwardRef, useRef } from 'react';

function getMotionComponent(as) {
    const tag = (as || "span");
    return motion[tag] || motion.span;
}
const ScrambleText = forwardRef(function ScrambleText({ children: text = "", as, active = true, delay, duration, interval, chars, onComplete, ...props }, ref) {
    const MotionComponent = getMotionComponent(as);
    const displayText = useMotionValue(text);
    const controlsRef = useRef(null);
    const onCompleteRef = useRef(onComplete);
    // Keep onComplete ref up to date without triggering effect
    useIsomorphicLayoutEffect(() => {
        onCompleteRef.current = onComplete;
    });
    // Effect 1: Reset MotionValue when text prop changes
    useIsomorphicLayoutEffect(() => {
        displayText.set(text);
    }, [text]);
    // Effect 2: Create scrambleText instance
    useIsomorphicLayoutEffect(() => {
        controlsRef.current?.stop();
        controlsRef.current = scrambleText(displayText, {
            delay,
            duration,
            interval,
            chars,
            onComplete: () => onCompleteRef.current?.(),
        });
        if (!active) {
            controlsRef.current.finish();
        }
        return () => controlsRef.current?.stop();
    }, [active, text, delay, duration, interval, chars]);
    return (jsx(MotionComponent, { ref: ref, ...props, children: displayText }));
});

export { ScrambleText };
