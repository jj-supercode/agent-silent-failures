import { z } from 'zod';

import { sourceIdSchema, type SourceId } from '../../trace/index.ts';
import type { SupervisorTask } from './model.ts';

const subjectsLinePrefix = 'Subjects: ';
const subjectSeparator = ' | ';

export type TaskBrief = {
    readonly question: string;
    readonly subjects: readonly [SourceId, SourceId];
};

const subjectsSchema = z.tuple([sourceIdSchema, sourceIdSchema]);

/** The supervisor's user message: the question, then the two subjects it should have researched, on their own line. */
export const renderTaskMessage = (task: SupervisorTask): string =>
    `${task.question}\n${subjectsLinePrefix}${task.subjects.join(subjectSeparator)}`;

/** Reads a task message back; `null` for any other text (e.g. a Studio chat message), so callers can fall back. */
export const parseTaskMessage = (message: string): TaskBrief | null => {
    const lines = message.split('\n');
    const subjectsLine = lines.at(-1) ?? '';
    if (!subjectsLine.startsWith(subjectsLinePrefix)) {
        return null;
    }
    const subjects = subjectsSchema.safeParse(subjectsLine.slice(subjectsLinePrefix.length).split(subjectSeparator));
    return subjects.success ? { question: lines.slice(0, -1).join('\n').trim(), subjects: subjects.data } : null;
};
