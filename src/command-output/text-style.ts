import { styleText } from 'node:util';

/** The few styles commands use; every one is the identity when colour is off. */
export type TextStyle = {
    readonly title: (text: string) => string;
    readonly label: (text: string) => string;
    readonly muted: (text: string) => string;
    readonly success: (text: string) => string;
    readonly failure: (text: string) => string;
    readonly warning: (text: string) => string;
    readonly command: (text: string) => string;
};

/** The `styleText` formats the output uses; Node does not export its own format types. */
type StyleFormat = 'bold' | 'dim' | 'gray' | 'green' | 'red' | 'yellow' | 'cyan';

const unstyled = (text: string): string => text;

/** `validateStream: false`: the output mode already decided whether colour is wanted. */
const styled =
    (format: StyleFormat) =>
    (text: string): string =>
        styleText(format, text, { validateStream: false });

export const plainStyle: TextStyle = {
    title: unstyled,
    label: unstyled,
    muted: unstyled,
    success: unstyled,
    failure: unstyled,
    warning: unstyled,
    command: unstyled,
};

export const colorStyle: TextStyle = {
    title: styled('bold'),
    label: styled('dim'),
    muted: styled('gray'),
    success: styled('green'),
    failure: styled('red'),
    warning: styled('yellow'),
    command: styled('cyan'),
};

export const textStyleFor = (color: boolean): TextStyle => (color ? colorStyle : plainStyle);
