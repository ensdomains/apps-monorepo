import { useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

function useBodyPortal(children) {
    const [hostElement, setHostElement] = useState(null);
    useLayoutEffect(() => {
        setHostElement(document.body);
    }, []);
    return hostElement ? createPortal(children, hostElement) : null;
}

export { useBodyPortal };
