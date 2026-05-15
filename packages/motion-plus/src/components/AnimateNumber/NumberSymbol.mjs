import { jsx } from 'react/jsx-runtime';
import { useIsPresent, motion, AnimatePresence } from 'motion/react';
import { forwardRef, useContext } from 'react';
import { maskHeight } from './Mask.mjs';
import { SectionContext } from './SectionContext.mjs';

const NumberSymbol = forwardRef(function NumberSymbol({ partKey, type, children, ...rest }, ref) {
    const isPresent = useIsPresent();
    const { justify } = useContext(SectionContext);
    return (jsx(motion.span, { ...rest, "data-state": isPresent ? undefined : "exiting", style: {
            display: "inline-flex",
            justifyContent: justify,
            padding: `calc(${maskHeight}/2) 0`, // match digits
            position: "relative", // needed for AnimatePresent popLayout
        }, ref: ref, children: jsx(AnimatePresence, { mode: "popLayout", anchorX: justify, initial: false, children: jsx(motion.span, { initial: { opacity: 0 }, animate: { opacity: [null, 1] }, exit: { opacity: [null, 0] }, style: {
                    display: "inline-block",
                    whiteSpace: "pre", // some symbols are spaces or thin spaces
                }, children: children }, children) }) }));
});

export { NumberSymbol };
