import { describe, expect, test } from 'vitest';

import { catalog } from '../../catalog/index.ts';
import { presetAvailability } from './preset-availability.ts';
import { presetObservation } from './preset-observation.ts';
import { activeFaultLine, faultListing } from './preset-text.ts';
import { studioFaultPresetList, studioFaultPresets } from './presets.ts';
import { selectStudioFault, studioFaultFromEnvironment, studioFaultVariable } from './studio-fault-option.ts';
import { studioFaultIds } from './model.ts';

describe('Studio fault presets', () => {
    test('there is one preset per id, and each is bound to a catalog fault case of the entry it should fire', () => {
        expect(studioFaultPresetList.map((preset) => preset.id)).toEqual(studioFaultIds);
        const catalogCases = catalog.flatMap((item) => item.faultCases);
        studioFaultPresetList.forEach((preset) => expect(catalogCases).toContain(preset.faultCase));
    });

    test('every catalog entry has at least one preset to show it firing', () => {
        const shown = new Set(studioFaultPresetList.map((preset) => preset.faultCase.entryId));
        expect(catalog.map((item) => item.entry.id).filter((entryId) => !shown.has(entryId))).toEqual([]);
    });

    test('only the supervisor-ignores-workers preset is scripted-only', () => {
        expect(
            studioFaultPresetList.filter((preset) => preset.live.kind === 'scripted-only').map((preset) => preset.id),
        ).toEqual(['supervisor-ignores-workers']);
    });
});

describe('selectStudioFault', () => {
    test('unset or empty is a clean session', () => {
        expect(selectStudioFault(undefined)).toEqual({ kind: 'none' });
        expect(studioFaultFromEnvironment({ [studioFaultVariable]: '' })).toEqual({ kind: 'none' });
    });

    test('a preset id selects that preset', () => {
        expect(studioFaultFromEnvironment({ [studioFaultVariable]: 'search-errors' })).toEqual({
            kind: 'preset',
            preset: studioFaultPresets['search-errors'],
        });
    });

    test('an unknown id is refused with the list of presets', () => {
        const selection = selectStudioFault('vector-off');
        expect(selection.kind).toBe('invalid');
        expect(selection.kind === 'invalid' && selection.reason).toContain('collapsed-embedder');
    });
});

describe('presetAvailability', () => {
    test('scripted mode runs every preset', () => {
        studioFaultPresetList.forEach((preset) =>
            expect(presetAvailability(preset, 'scripted')).toEqual({ kind: 'available' }),
        );
    });

    test('live mode refuses a scripted-only preset and says where it runs', () => {
        const availability = presetAvailability(studioFaultPresets['supervisor-ignores-workers'], 'live');
        expect(availability.kind).toBe('refused');
        expect(availability.kind === 'refused' && availability.reason).toContain('pnpm studio');
        expect(presetAvailability(studioFaultPresets['search-errors'], 'live')).toEqual({ kind: 'available' });
    });
});

describe('preset text', () => {
    test('the listing names every preset, the entry it should fire and whether it runs live', () => {
        const listing = faultListing();
        studioFaultPresetList.forEach((preset) => {
            expect(listing).toContain(`\n${preset.id}\n`);
            expect(listing).toContain(`fires:    ${preset.faultCase.entryId}: `);
            expect(listing).toContain(`scripted mode also runs the catalog fault ${preset.faultCase.faultId}/`);
        });
        expect(listing).toContain('runs:     live-capable');
        expect(listing).toContain('runs:     scripted-only: ');
    });

    test('the start line says a fault is active, what it breaks and what should fire', () => {
        const line = activeFaultLine(studioFaultPresets['search-drops-results'], 'scripted');
        expect(line).toContain('FAULT ACTIVE (scripted): search-drops-results');
        expect(line).toContain('mastra#24110');
        expect(line).toContain('Expect tool-loop to fire');
        expect(activeFaultLine(null, 'scripted')).toContain('no fault preset');
    });

    test('a live start line never promises a firing: a model that recovers is a correct clear', () => {
        const line = activeFaultLine(studioFaultPresets['search-drops-results'], 'live');
        expect(line).toContain('FAULT ACTIVE (live): search-drops-results');
        expect(line).not.toContain('Expect');
        expect(line).toContain('Score with tool-loop');
        expect(line).toContain('correct clear');
    });

    test('ingestion entries are read from the ingestion, multi-agent faults from the supervisor, others the RAG agent', () => {
        expect(presetObservation(studioFaultPresets['default-chunk-size'])).toBe('ingestion');
        expect(presetObservation(studioFaultPresets['worker-reply-dropped'])).toBe('supervisor-chat');
        expect(presetObservation(studioFaultPresets['search-errors'])).toBe('rag-agent-chat');
    });
});
