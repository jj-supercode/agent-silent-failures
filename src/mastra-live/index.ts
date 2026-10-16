import { formatStudioSpend } from '../live/studio/studio-spend.ts';
import { startStudioLive } from '../live/studio/start-studio-live.ts';
import { startStudioProject } from '../studio/index.ts';
import { StudioLiveRefusedError } from './errors.ts';

/**
 * The Mastra Studio project with a real model (`pnpm studio:live`): the same harness, memory, scorers and fault
 * presets as `pnpm studio`, with every agent on Claude Haiku 5.5 behind the session's spend cap. The key is read by the live
 * module only, never by the Mastra CLI (`MASTRA_SKIP_DOTENV=1`). The package script checks the key and the cap before
 * `mastra dev` starts, so the refusal here only guards a server started some other way.
 */
const started = await startStudioLive(process.env, (spend) => console.log(formatStudioSpend(spend)));
if (started.kind !== 'ready') {
    throw new StudioLiveRefusedError(started.reason);
}

export const mastra = await startStudioProject(process.env, { kind: 'live', model: started.model });
