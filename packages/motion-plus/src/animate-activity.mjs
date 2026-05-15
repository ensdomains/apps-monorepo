import { jsx } from 'react/jsx-runtime';
import { invariant, PresenceChild } from 'motion/react';
import { useState, Activity } from 'react';

function AnimateActivity({ mode: modeFromProps, layoutMode, children, }) {
    /**
     * This is the mode that we'll render.
     */
    const [mode, setMode] = useState(modeFromProps);
    /**
     * This is the goal state as defined by props.
     */
    const isPresent = modeFromProps === "visible";
    /**
     * Immediately switch to mode="visible" when the user
     * changes the mode prop.
     */
    if (isPresent && mode !== "visible") {
        setMode("visible");
        return null;
    }
    /**
     * Set mode to "hidden" only when the exit animation is complete.
     */
    const onExitComplete = () => setMode("hidden");
    invariant(Boolean(Activity), "Activity component not found - upgrade to React 19.2.0 or higher");
    return (jsx(Activity, { mode: mode, children: jsx(PresenceChild, { isPresent: isPresent, onExitComplete: !isPresent ? onExitComplete : undefined, presenceAffectsLayout: false, mode: layoutMode === "pop" ? "popLayout" : "sync", children: children }) }));
}

export { AnimateActivity };
