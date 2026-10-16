/**
 * Breaks text into lines of at most `maxCharacters` at spaces (a longer word gets a line of its own). SVG has no
 * text flow, and a character budget per font size keeps every line inside the chart without measuring glyphs.
 */
export const wrapWords = (text: string, maxCharacters: number): readonly string[] =>
    text
        .split(' ')
        .filter((word) => word.length > 0)
        .reduce<readonly string[]>((lines, word) => {
            const last = lines.at(-1);
            return last !== undefined && last.length + 1 + word.length <= maxCharacters
                ? [...lines.slice(0, -1), `${last} ${word}`]
                : [...lines, word];
        }, []);
