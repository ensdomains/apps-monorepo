import * as react_jsx_runtime from 'react/jsx-runtime';

interface AnimateActivityProps {
    mode: "visible" | "hidden";
    layoutMode: "default" | "pop";
    children: React.ReactNode;
}
declare function AnimateActivity({ mode: modeFromProps, layoutMode, children, }: AnimateActivityProps): react_jsx_runtime.JSX.Element | null;

export { AnimateActivity };
export type { AnimateActivityProps };
