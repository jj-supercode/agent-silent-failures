import type { SourceDocument } from '../../corpus/index.ts';
import { sentences } from '../../text/sentences.ts';
import type { SourceId } from '../../trace/index.ts';

/** Sentences per page: short pages make a paging reader call the same tool several times with only `page` changed. */
export const sentencesPerPage = 2;

export type SourcePage = {
    readonly sourceId: SourceId;
    /** 1-based. */
    readonly page: number;
    readonly text: string;
    readonly hasMore: boolean;
};

export type PagedSources = (sourceId: SourceId, page: number) => SourcePage | null;

/** Pages over each document's sentences; `null` for an unknown source or a page past the end. */
export const pageSources = (documents: readonly SourceDocument[]): PagedSources => {
    const sentencesBySource = new Map(documents.map((document) => [document.sourceId, sentences(document.text)]));
    return (sourceId, page) => {
        const sourceSentences = sentencesBySource.get(sourceId) ?? [];
        const start = (page - 1) * sentencesPerPage;
        return page < 1 || start >= sourceSentences.length
            ? null
            : {
                  sourceId,
                  page,
                  text: sourceSentences.slice(start, start + sentencesPerPage).join(' '),
                  hasMore: start + sentencesPerPage < sourceSentences.length,
              };
    };
};
