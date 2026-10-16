// Memory semantic recall with `embedder: fastembed` (the setup the semantic-recall docs
// show) splits messages into ~4096-token pieces but fastembed embeds only 512, so later text in a long message
// cannot be recalled.
import { mkdtempDisposable } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MastraDBMessage } from '@mastra/core/agent';
import { fastembed } from '@mastra/fastembed';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { MDocument } from '@mastra/rag';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import {
    distributionOf,
    evenlySpacedSample,
    loadOriginOfSpecies,
    measureChunks,
    sentencesInRegion,
    formatEstimate,
    wilsonEstimate,
    type ChunkRegion,
    type MeasuredChunk,
} from '../embedding-window/index.ts';

const messageCount = 40;
const recallTopK = 3;
const resourceId = 'repro-reader';
const threadId = 'repro-long-messages';
/** `Memory.chunkText` default budget (`tokenSize = 4096`, 4 characters per token) in @mastra/memory 1.37.1. */
const memoryChunkCharacterBudget = 4096 * 4;

const messageIdFor = (index: number): string => `long-message-${index}`;

const userMessage = (index: number, text: string): MastraDBMessage => ({
    id: messageIdFor(index),
    role: 'user',
    threadId: threadId,
    resourceId: resourceId,
    createdAt: new Date(Date.UTC(2026, 9, 14, 0, index)),
    content: { format: 2, parts: [{ type: 'text', text }] },
});

await using workspace = await mkdtempDisposable(join(tmpdir(), 'repro-memory-'));
const memory = new Memory({
    storage: new LibSQLStore({ id: 'repro-memory-store', url: `file:${join(workspace.path, 'memory.db')}` }),
    vector: new LibSQLVector({ id: 'repro-memory-vector', url: `file:${join(workspace.path, 'vector.db')}` }),
    embedder: fastembed,
    options: { lastMessages: false, semanticRecall: { topK: recallTopK, messageRange: 0, scope: 'thread' } },
});

const corpusChunks = (await MDocument.fromText(await loadOriginOfSpecies()).chunk()).map((chunk) => chunk.text);
const messages: readonly MeasuredChunk[] = await measureChunks(evenlySpacedSample(corpusChunks, messageCount));

await memory.createThread({ threadId: threadId, resourceId: resourceId });
await memory.saveMessages({ messages: messages.map((message, index) => userMessage(index, message.text)) });

const recallHitRate = async (region: ChunkRegion) => {
    const oneSentencePerMessage = [
        ...new Map(sentencesInRegion(messages, region).map((entry) => [entry.chunkIndex, entry])).values(),
    ];
    const hits = await Promise.all(
        oneSentencePerMessage.map(async ({ sentence, chunkIndex }) => {
            const recalled = await memory.recall({
                threadId: threadId,
                resourceId: resourceId,
                vectorSearchString: sentence,
            });
            return recalled.messages.some((message) => message.id === messageIdFor(chunkIndex));
        }),
    );
    return wilsonEstimate(hits.filter(Boolean).length, hits.length);
};

const embeddedRegion = await recallHitRate('embedded');
const neverEmbeddedRegion = await recallHitRate('never-embedded');
const everyMessageIsOneMemoryChunk = messages.every(
    (message) => message.coverage.characters <= memoryChunkCharacterBudget,
);

await reportOutcome(
    'memory-fastembed-truncation',
    outcomeWhen(
        everyMessageIsOneMemoryChunk && neverEmbeddedRegion.high < embeddedRegion.low,
        `semantic recall (topK ${recallTopK}) finds the message for ${formatEstimate(embeddedRegion)} of sentences from its first ` +
            `512 tokens but ${formatEstimate(neverEmbeddedRegion)} of sentences after them`,
        {
            setup: "new Memory({ embedder: fastembed, vector: LibSQLVector, storage: LibSQLStore }), semanticRecall scope 'thread'",
            messages: messageCount,
            messageCharacters: distributionOf(messages.map((message) => message.coverage.characters)),
            messageBgeContentTokens: distributionOf(messages.map((message) => message.coverage.contentTokens)),
            memoryChunkCharacterBudget: memoryChunkCharacterBudget,
            everyMessageIsOneMemoryChunk,
            recallTopK: recallTopK,
            queriesFromEmbeddedRegion: embeddedRegion,
            queriesFromNeverEmbeddedRegion: neverEmbeddedRegion,
        },
    ),
);
