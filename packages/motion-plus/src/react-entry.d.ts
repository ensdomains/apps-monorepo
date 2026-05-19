import * as react from 'react';
import react__default, { ComponentProps, ElementType, ComponentPropsWithoutRef, CSSProperties, PropsWithChildren } from 'react';
import { Point, SpringOptions, HTMLMotionProps, MotionValue, MotionConfig, MotionProps, HTMLElements, Transition, MotionStyle } from 'motion/react';
import * as react_jsx_runtime from 'react/jsx-runtime';
import { StaggerFunction } from 'motion-plus-dom';

type CursorProps = {
    follow?: boolean;
    center?: Point;
    offset?: Point;
    spring?: false | SpringOptions;
    magnetic?: boolean | Partial<MagneticOptions>;
    matchTextSize?: boolean;
};
type MagneticOptions = {
    morph: boolean;
    padding: number;
    snap: number;
};

declare function Cursor({ follow, center, offset: offsetPoint, spring, magnetic, matchTextSize, children, style, ...props }: CursorProps & HTMLMotionProps<"div">): react.ReactPortal | null;

declare function useCursorIsInView(resetSpring: VoidFunction): boolean;

type CursorType = "pointer" | "default" | "text";
interface CursorState {
    type: CursorType;
    isPressed: boolean;
    fontSize: number | null;
    targetBoundingBox: {
        width: number;
        height: number;
        top: number;
        right: number;
        bottom: number;
        left: number;
    } | null;
    target: CursorTarget | null;
    zone: string | null;
}
type CursorTarget = HTMLElement | SVGElement;

declare function useCursorState(): CursorState;

declare function usePointerPosition(): {
    x: MotionValue<number>;
    y: MotionValue<number>;
};

declare function useMagneticPull(ref: React.RefObject<HTMLElement | null>, pull?: number): {
    x: MotionValue<number>;
    y: MotionValue<number>;
};

/**
 * Controls the spin direction of digit animations.
 *
 * - A positive number (e.g. `1`) forces digits to always spin upward,
 *   wrapping from 9 → 0.
 * - A negative number (e.g. `-1`) forces digits to always spin downward,
 *   wrapping from 0 → 9.
 * - `0` or `undefined` uses the default auto-detection (shortest path
 *   based on value change).
 * - A function receives `(oldValue, newValue)` and should return a number
 *   indicating the direction.
 */
type Trend = number | ((oldValue: number, value: number) => number);

type AnimateNumberProps = Omit<HTMLMotionProps<"span">, "children"> & {
    /** The number to display. Accepts `number`, `bigint`, or numeric `string`. */
    children: number | bigint | string;
    /** Locale(s) for `Intl.NumberFormat`. e.g. `"en-US"`, `["de-DE", "en-US"]`. */
    locales?: Intl.LocalesArgument;
    /**
     * Options passed to `Intl.NumberFormat`.
     * Scientific and engineering notation are not supported.
     */
    format?: Omit<Intl.NumberFormatOptions, "notation"> & {
        notation?: Exclude<Intl.NumberFormatOptions["notation"], "scientific" | "engineering">;
    };
    /** Override the animation transition. Applies to `y` (digit spin), `width` (resize), and `opacity` (enter/exit). */
    transition?: ComponentProps<typeof MotionConfig>["transition"];
    /** Static text appended after the number (e.g. `"/mo"`). */
    suffix?: string;
    /** Static text prepended before the number (e.g. `"~"`). */
    prefix?: string;
    /**
     * Controls the spin direction of digit animations.
     *
     * - `1` — always spin upward (9 wraps to 0)
     * - `-1` — always spin downward (0 wraps to 9)
     * - `0` / `undefined` — auto-detect based on value change
     * - `(oldValue, newValue) => number` — custom function
     *
     * @example
     * // Always spin up, even when the value decreases
     * <AnimateNumber trend={1}>{value}</AnimateNumber>
     *
     * @example
     * // Custom: spin up for positive changes, down for negative
     * <AnimateNumber trend={(old, val) => Math.sign(val - old)}>
     *   {value}
     * </AnimateNumber>
     */
    trend?: Trend;
};
declare const AnimateNumber: react.ForwardRefExoticComponent<Omit<AnimateNumberProps, "ref"> & react.RefAttributes<HTMLDivElement>>;

interface AnimateTextProps {
    children: string;
    splitBy?: string;
    charClass?: string;
    wordClass?: string;
    lineClass?: string;
    type?: "char" | "word" | "line";
    variants?: MotionProps["variants"];
}
declare function AnimateText({ children, splitBy, charClass, wordClass, lineClass, type, variants, ...props }: AnimateTextProps): react_jsx_runtime.JSX.Element;

type ItemSize = "auto" | "fill" | "manual";

/**
 * Props for the Ticker component.
 */
interface TickerProps<TagName extends keyof HTMLElements = "div"> {
    /**
     * An array of React nodes to be rendered as ticker items.
     */
    items: react__default.ReactNode[];
    /**
     * The axis along which the ticker scrolls.
     *
     * @default "x"
     */
    axis?: "x" | "y";
    /**
     * The velocity of the ticker scroll in pixels per second. Defaults to 50.
     */
    velocity?: number;
    /**
     * Factor by which the velocity is multiplied when the ticker is hovered. Defaults to 1 (no change).
     */
    hoverFactor?: number;
    /**
     * The gap between ticker items in pixels. Defaults to 10.
     */
    gap?: number;
    /**
     * Alignment of items within the ticker. Defaults to "center".
     */
    align?: "start" | "center" | "end" | "stretch";
    /**
     * An optional MotionValue to control the ticker's offset externally.
     */
    offset?: MotionValue<number>;
    /**
     * Whether the ticker should be static. This is a display mode suitable for
     * design canvases that disables animations, measurements and viewport tracking.
     * Defaults to false. **Must** remain static for the duration of the component's lifecycle.
     */
    isStatic?: boolean;
    /**
     * The size of the ticker items.
     *
     * @default "auto"
     */
    itemSize?: ItemSize;
    /**
     * Show items that overflow the container.
     *
     * @default false
     */
    overflow?: boolean;
    /**
     * Allow the carousel to loop through its items.
     * If this is disabled, the carousel will not clone
     * any additional children.
     *
     * @default true
     */
    loop?: boolean;
    /**
     * By default, ticker items that disappear off the start of the visible area
     * will be reprojected to the end of the ticker items to reduce or eliminate
     * cloned items.
     *
     * The calculation for this is based on an item's layout. If for some reason
     * the item is transformed back within the visible area, this reprojection
     * might be visible. By setting a safe margin, you can extend the effective
     * visible area.
     *
     * @default 0
     */
    safeMargin?: number;
    /**
     * The element type to render as the root container. Defaults to "div".
     */
    as?: TagName;
    /**
     * The length of the fade at each end of the container.
     *
     * When looping is disabled, the fade will automatically animate
     * away when the content is scrolled to each end of the container.
     *
     * @default 0
     */
    fade?: number | `${number}%`;
    /**
     * The transition to use when fading the edges of the container.
     *
     * @default { duration: 0.2, ease: "linear" }
     */
    fadeTransition?: Transition;
    /**
     * The transition to use when paginating the container.
     *
     * @default { type: "spring", stiffness: 400, damping: 40 }
     */
    pageTransition?: Transition;
}
declare const Ticker: react__default.ForwardRefExoticComponent<Omit<TickerProps<keyof HTMLElements> & {
    children?: react__default.ReactNode | undefined;
} & Record<string, any>, "ref"> & react__default.RefAttributes<HTMLElement>>;

type Direction = "ltr" | "rtl";
interface ItemPosition {
    start: number;
    end: number;
}
interface TickerState {
    direction: Direction;
    visibleLength: number;
    inset: number;
    containerLength: number;
    totalItemLength: number;
    itemPositions: ItemPosition[];
    isMeasured: boolean;
    maxInset: number | null;
}

interface TickerInfo extends TickerState {
    gap: number;
    clampOffset: (offset: number) => number;
    offset: MotionValue<number>;
    renderedOffset: MotionValue<number>;
}
declare function useTicker(): TickerInfo;

interface TickerItemContextType {
    offset: MotionValue<number>;
    projection: MotionValue<number>;
    props: {
        className: string;
        style: MotionStyle;
        "aria-hidden"?: boolean | undefined;
        "aria-posinset"?: number | undefined;
        "aria-setsize"?: number | undefined;
    };
    itemIndex: number;
    cloneIndex: number | undefined;
    start: number;
    end: number;
}

declare function useTickerItem(): TickerItemContextType;

declare const TYPING_SPEEDS: {
    readonly slow: 130;
    readonly normal: 75;
    readonly fast: 30;
};
type TypingSpeed = keyof typeof TYPING_SPEEDS;
type TypewriterOwnProps<T extends ElementType> = {
    /**
     * The text content to animate in with a "typewriter" animation.
     */
    children: string;
    /**
     * The HTML element or component to render as (defaults to "span")
     *
     * @default "span"
     */
    as?: T;
    /**
     * Typing speed preset (default: "normal")
     * - slow: 130ms per character
     * - normal: 75ms per character
     * - fast: 30ms per character
     *
     * @default "normal"
     */
    speed?: TypingSpeed | number;
    /**
     * Amount of variance in timing between characters as a factor of the speed.
     * Defaults to "natural" for realistic human typing patterns.
     *
     * @default "natural"
     */
    variance?: number | "natural";
    /**
     * Whether the animation should be playing (default: true)
     * This is useful to manually start the animation
     * when the component enters the viewport.
     *
     * @default true
     */
    play?: boolean;
    /**
     * Custom className for the cursor element
     */
    cursorClassName?: string;
    /**
     * Custom styles for the cursor element
     */
    cursorStyle?: React.CSSProperties;
    /**
     * Custom className for the text element
     */
    textClassName?: string;
    /**
     * Custom styles for the text element
     */
    textStyle?: React.CSSProperties;
    /**
     * The duration of the cursor blink animation in seconds (default: 0.5)
     *
     * @default 0.5
     */
    cursorBlinkDuration?: number;
    /**
     * The number of times a cursor should blink _after_ the typing completes (default: Infinity).
     * > Note: _The cursor will always be visible immediately after typing._
     */
    cursorBlinkRepeat?: number;
    /**
     * Callback when typing animation completes
     *
     * @default undefined
     */
    onComplete?: () => void;
    /**
     * Callback fired on each character change during typing animation.
     *
     * @param info.text - The full current displayed string
     * @param info.character - The character(s) that were typed or removed
     * @param info.isBackspace - `true` if this was a backspace operation
     */
    onChange?: (info: {
        text: string;
        character: string;
        isBackspace: boolean;
    }) => void;
    /**
     * Replacement method for changed content:
     * - "all": Replace all text instantly
     * - "type": Type from current text to new text
     *
     * @default "type"
     */
    replace?: "all" | "type";
    /**
     * When using replace: "type", how to backspace to the common prefix.
     * - "character": Backspace one character at a time
     * - "word": Backspace one word at a time (like option-backspace)
     * - "all": Jump immediately to the common prefix
     *
     * @default "character"
     */
    backspace?: "character" | "word" | "all";
    /**
     * The speed factor for backspacing relative to typing speed
     * @default 0.2 - backspace 5x faster than typing
     */
    backspaceFactor?: number;
};
type TypewriterProps<T extends ElementType = "span"> = TypewriterOwnProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof TypewriterOwnProps<T>>;

declare const Typewriter: react.ForwardRefExoticComponent<Omit<TypewriterProps<ElementType>, "ref"> & react.RefAttributes<unknown>>;

type ScrambleTextOwnProps<T extends ElementType> = {
    /**
     * The text content to scramble.
     */
    children: string;
    /**
     * The HTML element or component to render as (defaults to "span")
     *
     * @default "span"
     */
    as?: T;
    /**
     * Whether the scramble animation is active.
     * When true, characters scramble according to delay/duration.
     * When false, characters reveal (with stagger offsets preserved).
     *
     * @default true
     */
    active?: boolean;
    /**
     * Delay before each character starts scrambling.
     * Can be a number (seconds) or a stagger function like `stagger(0.1)`.
     *
     * @default 0
     */
    delay?: number | StaggerFunction;
    /**
     * How long each character stays scrambled before revealing.
     * Can be a number (seconds), Infinity, or a stagger function.
     * Use Infinity to keep scrambling until active becomes false.
     *
     * @default 1
     */
    duration?: number | StaggerFunction;
    /**
     * Seconds between random character switches while scrambling.
     *
     * @default 0.05
     */
    interval?: number;
    /**
     * Characters to use for scrambling.
     * Can be a string of characters or an array of strings (for emoji support).
     *
     * @default "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
     */
    chars?: string | string[];
    /**
     * Callback when all characters have been revealed.
     */
    onComplete?: () => void;
    /**
     * Custom className
     */
    className?: string;
    /**
     * Custom styles
     */
    style?: CSSProperties;
};
type ScrambleTextProps<T extends ElementType = "span"> = ScrambleTextOwnProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof ScrambleTextOwnProps<T>>;

declare const ScrambleText: react.ForwardRefExoticComponent<Omit<ScrambleTextProps<ElementType>, "ref"> & react.RefAttributes<unknown>>;

interface CarouselProps<TagName extends keyof HTMLElements = "div"> extends Omit<TickerProps<TagName>, "velocity" | "offset" | "hoverFactor" | "pageTransition"> {
    /**
     * The snap type to use for the carousel while
     * free-scrolling.
     *
     * - "page" - Snap to the next or previous page of items.
     * - "loose" - Use normal scroll momentum, resting on the closest item to the natural scroll resting point.
     * - false - No snapping.
     *
     * @default: "page"
     */
    snap?: "page" | "loose" | false;
    /**
     * The initial page to display when the carousel mounts.
     * Pages are calculated based on item positions and container size.
     */
    page?: number;
}

declare function Carousel({ children, loop, transition, axis, snap, page, ...props }: PropsWithChildren<HTMLMotionProps<"div"> & CarouselProps>): react_jsx_runtime.JSX.Element;

interface CarouselInfo {
    currentPage: number;
    totalPages: number;
    nextPage: VoidFunction;
    prevPage: VoidFunction;
    isNextActive: boolean;
    isPrevActive: boolean;
    gotoPage: (page: number) => void;
    offset: MotionValue<number>;
    targetOffset: MotionValue<number>;
}
declare function useCarousel(): CarouselInfo;

export { AnimateNumber, AnimateText, Carousel, Cursor, ScrambleText, Ticker, Typewriter, useCarousel, useCursorIsInView, useCursorState, useMagneticPull, usePointerPosition, useTicker, useTickerItem };
export type { AnimateNumberProps, AnimateTextProps, CursorProps, ScrambleTextProps, TickerProps, TypewriterProps, TypingSpeed };
