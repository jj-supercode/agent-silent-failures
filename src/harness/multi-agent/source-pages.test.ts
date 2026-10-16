import { describe, expect, test } from 'vitest';

import { sourceIdSchema } from '../../trace/index.ts';
import { pageSources, sentencesPerPage } from './source-pages.ts';

const edWood = sourceIdSchema.parse('Ed Wood');
const sentences = ['One.', 'Two!', 'Three?', 'Four.', 'Five.'];
const pages = pageSources([{ sourceId: edWood, text: sentences.join(' ') }]);

describe('pageSources', () => {
    test('serves sentences page by page and says whether more follow', () => {
        expect(pages(edWood, 1)).toEqual({ sourceId: edWood, page: 1, text: 'One. Two!', hasMore: true });
        expect(pages(edWood, 3)).toEqual({ sourceId: edWood, page: 3, text: 'Five.', hasMore: false });
    });

    test('has no page past the end, before the first, or of an unknown source', () => {
        const lastPage = Math.ceil(sentences.length / sentencesPerPage);
        expect([pages(edWood, lastPage + 1), pages(edWood, 0), pages(sourceIdSchema.parse('Nowhere'), 1)]).toEqual([
            null,
            null,
            null,
        ]);
    });
});
