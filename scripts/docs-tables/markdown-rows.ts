const cellText = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');

/** A plain GitHub-flavoured table; Prettier pads it when the page is written. */
export const markdownRows = (headers: readonly string[], rows: readonly (readonly string[])[]): string =>
    [headers, headers.map(() => '---'), ...rows].map((cells) => `| ${cells.map(cellText).join(' | ')} |`).join('\n');
