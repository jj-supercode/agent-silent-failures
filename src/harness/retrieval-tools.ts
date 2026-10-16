import { decodeHitList, type RetrievedRowsDecoder, type ToolName } from '../trace/index.ts';
import { searchCorpusToolId } from './search/search-corpus-tool.ts';

/** The run-view options for traces this harness produces: `searchCorpus` is its only retrieval tool. */
export const harnessRetrievalTools: ReadonlyMap<ToolName, RetrievedRowsDecoder> = new Map([
    [searchCorpusToolId, decodeHitList],
]);
