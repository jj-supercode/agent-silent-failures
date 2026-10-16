/**
 * Text cut to at most `maxLength` characters for a table cell or a one-line example: whole words only, with an
 * ellipsis when anything was cut.
 */
export const excerpt = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
        return text;
    }
    const room = text.slice(0, maxLength - 3);
    const lastSpace = room.lastIndexOf(' ');
    return `${(lastSpace > 0 ? room.slice(0, lastSpace) : room).replace(/[\s,;:(]+$/, '')}...`;
};
