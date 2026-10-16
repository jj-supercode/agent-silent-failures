import { Memory } from '@mastra/memory';

/** Studio chat history kept per thread and replayed to the agent. */
export const studioHistoryMessages = 10;

/**
 * Conversation history for the Studio agent, so a follow-up question stays in its thread. No storage is given: the
 * memory uses the Mastra instance's own store. Semantic recall stays off, so memory never embeds or retrieves.
 */
export const createStudioMemory = (): Memory =>
    new Memory({ options: { lastMessages: studioHistoryMessages, semanticRecall: false } });
