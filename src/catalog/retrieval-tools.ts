import { harnessRetrievalTools } from '../harness/index.ts';
import type { RunViewOptions } from '../trace/index.ts';

/** How the bed's run entries read harness traces: `searchCorpus` is the harness's only retrieval tool. */
export const harnessRunViewOptions: RunViewOptions = { retrievalTools: harnessRetrievalTools };
