export type TableColumn<TRow> = {
    readonly header: string;
    readonly cell: (row: TRow) => string;
    readonly align?: 'left' | 'right';
};

const escapeCell = (text: string): string => text.replaceAll('|', '\\|');

const pad = (text: string, width: number, align: 'left' | 'right'): string =>
    align === 'right' ? text.padStart(width) : text.padEnd(width);

const ruleFor = (width: number, align: 'left' | 'right'): string =>
    align === 'right' ? `${'-'.repeat(Math.max(2, width - 1))}:` : '-'.repeat(Math.max(3, width));

/** A GitHub-flavoured markdown table, padded so it also reads as plain text in a terminal. */
export const markdownTable = <TRow>(columns: readonly TableColumn<TRow>[], rows: readonly TRow[]): string => {
    const aligns = columns.map((column) => column.align ?? 'left');
    const cells = rows.map((row) => columns.map((column) => escapeCell(column.cell(row))));
    const widths = columns.map((column, index) =>
        Math.max(3, column.header.length, ...cells.map((line) => line[index]?.length ?? 0)),
    );
    const line = (values: readonly string[]): string =>
        `| ${values.map((value, index) => pad(value, widths[index] ?? 0, aligns[index] ?? 'left')).join(' | ')} |`;
    return [
        line(columns.map((column) => escapeCell(column.header))),
        line(widths.map((width, index) => ruleFor(width, aligns[index] ?? 'left'))),
        ...cells.map(line),
    ].join('\n');
};
