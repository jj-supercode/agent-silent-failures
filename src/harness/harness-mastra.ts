import { ConsoleLogger } from '@mastra/core/logger';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { MastraStorageExporter, Observability } from '@mastra/observability';

import { searchPositionsPerRequest } from './search/search-positions.ts';

type MastraConfig = NonNullable<ConstructorParameters<typeof Mastra>[0]>;

export type HarnessMastraInput = Pick<MastraConfig, 'agents' | 'workflows' | 'scorers'>;

export const observabilityServiceName = 'agent-silent-failures';

/**
 * Mastra with in-memory storage and the storage exporter, so every agent and workflow run is readable as a trace
 * in the same process. Spans reach storage only after `flushObservability`. The logger keeps warnings and errors:
 * the bed builds a harness per configuration, and each shutdown would otherwise print three info lines. Failures
 * the bed acts on (a trace still in progress, a failed run) come back as typed results, never through logs.
 */
export const createHarnessMastra = (input: HarnessMastraInput): Mastra =>
    new Mastra({
        ...input,
        logger: new ConsoleLogger({ name: observabilityServiceName, level: 'warn' }),
        storage: new InMemoryStore(),
        server: { middleware: searchPositionsPerRequest },
        observability: new Observability({
            configs: {
                default: { serviceName: observabilityServiceName, exporters: [new MastraStorageExporter()] },
            },
        }),
    });

export const flushObservability = async (mastra: Mastra): Promise<void> => {
    await mastra.observability.getDefaultInstance()?.flush();
};
