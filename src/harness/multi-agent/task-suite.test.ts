import { describe, expect, test } from 'vitest';

import { sampleQuestion } from '../../corpus/testing.ts';
import { sourceIdSchema } from '../../trace/index.ts';
import { parseTaskMessage, renderTaskMessage } from './task-message.ts';
import { toSupervisorTask, toSupervisorTasks } from './task-suite.ts';

const comparison = sampleQuestion('q-compare', ['Scott Derrickson', 'Ed Wood', 'Denver']);
const bridge = sampleQuestion('q-bridge', ['Lake Louisvilla, Louisville', 'Oldham County, Kentucky', 'Casey County'], {
    type: 'bridge',
});

describe('toSupervisorTask', () => {
    test('a question becomes a task over its two gold sources, in supporting-fact order', () => {
        expect(toSupervisorTask(comparison)?.subjects).toEqual(['Scott Derrickson', 'Ed Wood']);
    });

    test('a bridge question becomes a task too', () => {
        expect(toSupervisorTask(bridge)?.subjects).toEqual(['Lake Louisvilla, Louisville', 'Oldham County, Kentucky']);
    });

    test('a question without exactly two gold sources is skipped', () => {
        const singleSource = sampleQuestion('q-single', ['Ed Wood', 'Denver'], {
            supportingFacts: [{ sourceId: sourceIdSchema.parse('Ed Wood'), sentenceIndex: 0 }],
        });
        expect(toSupervisorTasks([comparison, singleSource])).toHaveLength(1);
    });
});

describe('task message', () => {
    test('round-trips the question and subjects, including titles with commas', () => {
        const task = toSupervisorTask(bridge);
        if (task === null) {
            throw new Error('the sample bridge question has two gold sources');
        }
        expect(parseTaskMessage(renderTaskMessage(task))).toEqual({ question: task.question, subjects: task.subjects });
    });

    test('any other text is not a task brief', () => {
        expect(parseTaskMessage('Who directed Ed Wood?')).toBeNull();
    });
});
