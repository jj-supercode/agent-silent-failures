/** A named region of a markdown file that `pnpm docs:tables` owns; everything outside it is hand-written. */
export const generatedBlockMarkers = (name: string) =>
    ({
        start: `<!-- docs-tables:${name}:start -->`,
        end: `<!-- docs-tables:${name}:end -->`,
    }) as const;

export type BlockReplacement =
    | { readonly kind: 'replaced'; readonly markdown: string }
    | { readonly kind: 'missing-markers'; readonly name: string };

/** Rewrites only the text between one block's markers; the rest of the file is kept byte for byte. */
export const replaceGeneratedBlock = (markdown: string, name: string, content: string): BlockReplacement => {
    const { start, end } = generatedBlockMarkers(name);
    const startIndex = markdown.indexOf(start);
    const endIndex = markdown.indexOf(end);
    return startIndex === -1 || endIndex === -1 || endIndex < startIndex
        ? { kind: 'missing-markers', name }
        : {
              kind: 'replaced',
              markdown: `${markdown.slice(0, startIndex + start.length)}\n\n${content}\n\n${markdown.slice(endIndex)}`,
          };
};

/** Applies every block in order and stops at the first one whose markers are missing. */
export const replaceGeneratedBlocks = (markdown: string, blocks: Readonly<Record<string, string>>): BlockReplacement =>
    Object.entries(blocks).reduce<BlockReplacement>(
        (current, [name, content]) =>
            current.kind === 'replaced' ? replaceGeneratedBlock(current.markdown, name, content) : current,
        { kind: 'replaced', markdown },
    );
