"use client";
import { jsxs, jsx } from 'react/jsx-runtime';
import { getTypewriterDelay, getNextText } from 'motion-plus-dom';
import { useMotionValue, motion, animate, delay } from 'motion/react';
import { forwardRef, useRef, useEffect } from 'react';
import { TYPING_SPEEDS } from './types.mjs';

const Typewriter = forwardRef(function Typewriter({ children: text = "", as, speed = "normal", variance = "natural", cursorClassName = "motion-typewriter-cursor", cursorStyle, cursorBlinkDuration = 0.5, cursorBlinkRepeat = Infinity, onComplete, onChange, play = true, "aria-label": ariaLabel, textClassName, textStyle, replace = "type", backspace = "character", backspaceFactor = 0.2, ...props }, ref) {
    const Component = (as || "span");
    const targetText = useRef(text);
    const displayText = useMotionValue("");
    const cancelDelay = useRef(null);
    const cursorBlinkAnimation = useRef(null);
    const cursorRef = useRef(null);
    const interval = typeof speed === "number" ? speed : TYPING_SPEEDS[speed];
    const clearDelay = () => {
        cancelDelay.current?.();
        cancelDelay.current = null;
    };
    const startCursorBlinkAnimation = () => {
        cursorBlinkAnimation.current = animate(cursorRef.current, {
            opacity: [1, 1, 0, 0],
        }, {
            duration: cursorBlinkDuration,
            times: [0, 0.5, 0.5, 1],
            ease: "linear",
            repeat: Math.max(0, cursorBlinkRepeat) * 2,
            repeatType: "reverse",
        });
        cursorBlinkAnimation.current.finished.then(() => {
            cursorBlinkAnimation.current?.cancel();
        });
    };
    useEffect(() => {
        /**
         * If we're using replace: "all" and the text changes, we can instantly
         * reset the displayed text.
         */
        if (replace === "all" && text !== targetText.current) {
            // Reset and start over
            displayText.set("");
        }
        targetText.current = text;
    }, [text, replace]);
    useEffect(() => {
        if (!play) {
            startCursorBlinkAnimation();
            clearDelay();
            return;
        }
        cursorBlinkAnimation.current?.cancel();
        const nextCharacter = () => {
            const previousText = displayText.get();
            const nextText = getNextText(previousText, text, replace, backspace);
            displayText.set(nextText);
            if (onChange) {
                const isBackspace = nextText.length < previousText.length;
                const character = isBackspace
                    ? previousText.slice(nextText.length)
                    : nextText.slice(previousText.length);
                onChange({ text: nextText, character, isBackspace });
            }
            if (nextText !== text) {
                scheduleNextCharacter();
            }
            else {
                startCursorBlinkAnimation();
                onComplete?.();
            }
        };
        const scheduleNextCharacter = () => {
            cancelDelay.current = delay(nextCharacter, getTypewriterDelay(text, displayText.get(), interval, variance, backspaceFactor));
        };
        if (!cancelDelay.current) {
            scheduleNextCharacter();
        }
        return clearDelay;
    }, [play, onComplete, onChange, text, interval, variance, backspaceFactor, backspace]);
    return (jsxs(Component, { ref: ref, ...props, "aria-label": ariaLabel || text, children: [jsx(motion.span, { className: textClassName, style: textStyle, children: displayText }), jsx(motion.span, { ref: cursorRef, className: cursorClassName, style: {
                    display: "inline-block",
                    width: "2px",
                    height: "1em",
                    backgroundColor: "currentColor",
                    position: "relative",
                    top: "0.1em",
                    left: "0.2em",
                    ...cursorStyle,
                } })] }));
});

export { Typewriter };
