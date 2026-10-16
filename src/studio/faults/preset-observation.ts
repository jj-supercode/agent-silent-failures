import { catalogEntries } from '../../catalog/index.ts';
import type { StudioFaultPreset } from './model.ts';

/**
 * Where a preset's expected verdict shows up: the session's corpus ingestion (an ingestion entry), or a chat with the
 * RAG agent (single-agent faults) or the supervisor (multi-agent faults).
 */
export type PresetObservation = 'ingestion' | 'rag-agent-chat' | 'supervisor-chat';

export const presetObservation = (preset: StudioFaultPreset): PresetObservation => {
    if (catalogEntries.some((entry) => entry.id === preset.faultCase.entryId && entry.kind === 'ingestion')) {
        return 'ingestion';
    }
    return preset.faultCase.setting.harness === 'multi-agent' ? 'supervisor-chat' : 'rag-agent-chat';
};
