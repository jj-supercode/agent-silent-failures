import { startStudioProject } from '../studio/index.ts';

/**
 * The key-free Mastra Studio project (`pnpm studio`, which runs `mastra dev` with `.env` loading switched off): the
 * scripted agents and every catalog scorer, under the fault preset `--fault` selects. No test, demo or Docker path
 * imports this file, and an import-graph test proves it cannot reach the live module. Chat with an agent, then score
 * its trace under Observability.
 */
export const mastra = await startStudioProject(process.env, { kind: 'scripted' });
