import { jsx } from 'react/jsx-runtime';
import { motion } from 'motion/react';
import * as React from 'react';
import { useMemo } from 'react';

const MotionFragment = motion.create(React.Fragment);
function splitText(text, { splitBy = " ", charClass = "split-char", wordClass = "split-word", variants, type, } = {}) {
    const words = text.split(splitBy);
    const elements = [];
    const delimiter = splitBy === " " ? "\u00A0" : splitBy;
    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
        const word = words[wordIndex];
        const characterElements = [];
        const chars = Array.from(word);
        for (let charIndex = 0; charIndex < chars.length; charIndex++) {
            let char = chars[charIndex];
            if (wordIndex < words.length - 1 &&
                charIndex === chars.length - 1) {
                char += delimiter;
            }
            const Component = type === "char" ? motion.span : "span";
            characterElements.push(jsx(Component, { className: `${charClass} ${charClass}-${charIndex + 1}`, style: { display: "inline-block" }, ...(type === "char" ? { variants } : {}), children: char }, `${wordIndex}-${charIndex}`));
        }
        const WordComponent = type === "word" ? motion.span : "span";
        elements.push(jsx(WordComponent, { className: `${wordClass} ${wordClass}-${wordIndex + 1}`, style: { display: "inline-block" }, ...(type === "word" ? { variants } : {}), children: characterElements }, `word-${wordIndex}`));
    }
    return elements;
}
function AnimateText({ children, splitBy = " ", charClass = "split-char", wordClass = "split-word", lineClass = "split-line", type = "char", variants, ...props }) {
    const elements = useMemo(() => {
        return splitText(children, {
            splitBy,
            charClass,
            wordClass,
            variants,
            type,
        });
    }, [children, splitBy, charClass, wordClass]);
    return jsx(MotionFragment, { ...props, children: elements });
}

export { AnimateText };
