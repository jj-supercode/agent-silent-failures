import { describe, expect, test } from 'vitest';

import { generatedBlockMarkers, replaceGeneratedBlock, replaceGeneratedBlocks } from './generated-block.ts';

const page = (name: string, inner: string): string => {
    const { start, end } = generatedBlockMarkers(name);
    return `# Title\n\nHand-written.\n\n${start}${inner}${end}\n\nAfter.\n`;
};

describe('replaceGeneratedBlock', () => {
    test('rewrites the text between the markers and keeps the rest of the page', () => {
        const result = replaceGeneratedBlock(page('entries', '\n\nold\n\n'), 'entries', 'new');

        expect(result).toEqual({ kind: 'replaced', markdown: page('entries', '\n\nnew\n\n') });
    });

    test('is idempotent', () => {
        const once = replaceGeneratedBlock(page('entries', ''), 'entries', 'table');
        const twice = once.kind === 'replaced' ? replaceGeneratedBlock(once.markdown, 'entries', 'table') : once;

        expect(twice).toEqual(once);
    });

    test('reports a page without the named block instead of appending it', () => {
        expect(replaceGeneratedBlock(page('entries', ''), 'headline', 'x')).toEqual({
            kind: 'missing-markers',
            name: 'headline',
        });
    });

    test('reports markers in the wrong order as missing', () => {
        const { start, end } = generatedBlockMarkers('entries');

        expect(replaceGeneratedBlock(`${end}${start}`, 'entries', 'x').kind).toBe('missing-markers');
    });
});

describe('replaceGeneratedBlocks', () => {
    test('stops at the first block whose markers are missing', () => {
        expect(replaceGeneratedBlocks(page('entries', ''), { entries: 'a', headline: 'b' })).toEqual({
            kind: 'missing-markers',
            name: 'headline',
        });
    });
});
