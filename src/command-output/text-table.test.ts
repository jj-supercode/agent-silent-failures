import { styleText } from 'node:util';

import { describe, expect, test } from 'vitest';

import { textTable } from './text-table.ts';

const columns = [
    { header: 'detector', align: 'left' },
    { header: 'caught', align: 'right' },
] as const;

describe('textTable', () => {
    test('aligns columns and trims trailing spaces', () => {
        expect(
            textTable(columns, [
                ['flat-score', '9/9'],
                ['tool-loop', '18/18'],
            ]),
        ).toEqual(['detector    caught', 'flat-score     9/9', 'tool-loop    18/18']);
    });

    test('styled cells take only their visible width', () => {
        const green = styleText('green', '9/9', { validateStream: false });
        const [, row] = textTable(columns, [['flat-score', green]]);
        expect(row?.replace(green, '9/9')).toBe('flat-score     9/9');
    });
});
