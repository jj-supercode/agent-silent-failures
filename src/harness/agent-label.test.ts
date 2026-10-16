import { describe, expect, test } from 'vitest';

import { agentLabelled, workerLabelled } from './agent-label.ts';

const supervisor = { name: 'Supervisor', description: 'Answers by delegating.' };

describe('agent labels', () => {
    test('without a label nothing changes', () => {
        expect(agentLabelled(supervisor, undefined)).toBe(supervisor);
        expect(workerLabelled(supervisor, undefined)).toBe(supervisor);
    });

    test('a top-level agent shows the label in its name and its description', () => {
        expect(agentLabelled(supervisor, 'FAULT search-errors')).toEqual({
            name: 'Supervisor [FAULT search-errors]',
            description: '[FAULT search-errors] Answers by delegating.',
        });
    });

    test("a worker's name is never relabelled: delegation tools are named after workers", () => {
        expect(workerLabelled({ name: 'Researcher', description: 'Searches.' }, 'FAULT x')).toEqual({
            name: 'Researcher',
            description: '[FAULT x] Searches.',
        });
    });
});
