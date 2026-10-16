import type { ChartTheme, ThemeName } from './model.ts';

/**
 * Surfaces are GitHub's light and dark page colours, where the README renders. The two categorical slots (blue,
 * orange) pass the lightness, chroma, colour-vision-deficiency separation and 3:1 contrast checks against both
 * surfaces; each dark step is chosen for the dark surface, not flipped from the light one.
 */
export const chartThemes = {
    light: {
        surface: '#ffffff',
        primaryInk: '#0b0b0b',
        secondaryInk: '#52514e',
        mutedInk: '#6b6a65',
        gridline: '#e1e0d9',
        categorical: { 0: '#2a78d6', 1: '#eb6834' },
    },
    dark: {
        surface: '#0d1117',
        primaryInk: '#f0efec',
        secondaryInk: '#c3c2b7',
        mutedInk: '#9a9891',
        gridline: '#2a2f36',
        categorical: { 0: '#3987e5', 1: '#d95926' },
    },
} as const satisfies Record<ThemeName, ChartTheme>;
