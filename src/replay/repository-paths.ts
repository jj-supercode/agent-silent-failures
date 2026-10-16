import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
export const fixturesRoot = path.join(repositoryRoot, 'fixtures');
export const defaultReplayOutputDirectory = path.join(repositoryRoot, 'results', 'replay');
