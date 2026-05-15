import * as react_jsx_runtime from 'react/jsx-runtime';
import { PropsWithChildren } from 'react';
import { Transition, TargetAndTransition, AnimationPlaybackControls } from 'motion-dom';

type AnimationType = "enter" | "exit" | "share" | "update";
type ViewAnimationStartCallback = (animation: AnimationPlaybackControls, type: AnimationType) => void;
type ViewAnimationCompleteCallback = (type: AnimationType) => void;
interface AnimateViewProps {
    transition?: Transition;
    enter?: TargetAndTransition | ((types: string[]) => TargetAndTransition);
    exit?: TargetAndTransition | ((types: string[]) => TargetAndTransition);
    share?: TargetAndTransition | ((types: string[]) => TargetAndTransition);
    update?: TargetAndTransition | ((types: string[]) => TargetAndTransition);
    onAnimationStart?: ViewAnimationStartCallback;
    onAnimationComplete?: ViewAnimationCompleteCallback;
    name?: string;
}

declare function AnimateView({ children, ...props }: PropsWithChildren<AnimateViewProps>): react_jsx_runtime.JSX.Element;

export { AnimateView };
