import { useState, useEffect } from 'react';

let listener = null;
function startInViewListener() {
    const listeners = new Set();
    function showCursor() {
        listeners.forEach((listener) => listener.show());
    }
    function hideCursor() {
        listeners.forEach((listener) => listener.hide());
    }
    function addEventListeners() {
        document.body.addEventListener("mouseenter", showCursor);
        document.body.addEventListener("mouseleave", hideCursor);
    }
    function removeEventListeners() {
        document.body.removeEventListener("mouseenter", showCursor);
        document.body.removeEventListener("mouseleave", hideCursor);
    }
    return {
        on: (callbacks) => {
            if (!listeners.size) {
                addEventListeners();
            }
            listeners.add(callbacks);
            return () => {
                listeners.delete(callbacks);
                if (listeners.size === 0) {
                    removeEventListeners();
                }
            };
        },
    };
}
function getInViewListener() {
    if (!listener) {
        listener = startInViewListener();
    }
    return listener;
}
function useCursorIsInView(resetSpring) {
    const [isVisible, setIsVisible] = useState(true);
    useEffect(() => {
        return getInViewListener().on({
            show: () => {
                if (isVisible)
                    return;
                resetSpring();
                setIsVisible(true);
            },
            hide: () => setIsVisible(false),
        });
    }, [isVisible]);
    return isVisible;
}

export { useCursorIsInView };
