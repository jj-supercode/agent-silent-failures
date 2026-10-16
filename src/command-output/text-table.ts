import { stripVTControlCharacters } from 'node:util';

export type ColumnAlignment = 'left' | 'right';

export type TableColumn = { readonly header: string; readonly align: ColumnAlignment };

/** Printed width: styling escapes take no columns. */
const visibleWidth = (text: string): number => stripVTControlCharacters(text).length;

const pad = (text: string, width: number, align: ColumnAlignment): string => {
    const fill = ' '.repeat(Math.max(0, width - visibleWidth(text)));
    return align === 'left' ? `${text}${fill}` : `${fill}${text}`;
};

const columnGap = '  ';

/**
 * Aligned columns with a header row, for a terminal or a log. Cells may be styled; widths count visible characters.
 * Trailing spaces are trimmed so plain output stays diff-friendly.
 */
export const textTable = (
    columns: readonly TableColumn[],
    rows: readonly (readonly string[])[],
    styleHeader: (text: string) => string = (text) => text,
): readonly string[] => {
    const widths = columns.map((column, index) =>
        Math.max(visibleWidth(column.header), ...rows.map((row) => visibleWidth(row[index] ?? ''))),
    );
    const line = (cells: readonly string[]): string =>
        columns
            .map((column, index) => pad(cells[index] ?? '', widths[index] ?? 0, column.align))
            .join(columnGap)
            .trimEnd();
    return [styleHeader(line(columns.map((column) => column.header))), ...rows.map(line)];
};
