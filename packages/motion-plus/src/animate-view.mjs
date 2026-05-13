import { jsx } from 'react/jsx-runtime';
import React, { useInsertionEffect } from 'react';
import { createViewAnimation } from './animate-view2.mjs';
import { useResetViewTransitions } from './animate-view3.mjs';
import { sharedProps } from './animate-view4.mjs';

const ViewTransition = React.ViewTransition;
function AnimateView({ children, ...props }) {
    useResetViewTransitions();
    const { name } = props;
    useInsertionEffect(() => {
        if (name) {
            sharedProps.set(name, props);
            return () => {
                sharedProps.delete(name);
            };
        }
    }, [name]);
    return (jsx(ViewTransition, { name: name, onEnter: createViewAnimation("enter", props), onExit: createViewAnimation("exit", props), onShare: createViewAnimation("share", props), onUpdate: createViewAnimation("update", props), children: children }));
}

export { AnimateView };
