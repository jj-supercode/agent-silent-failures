import { countText } from '../../src/command-output/index.ts';
import { multiAgentSearchOutage, searchOutage } from './lesson-subjects.ts';
import type { OutageAnswers } from './outage-answers.ts';

const ofRuns = (part: number, whole: number): string => `${countText(part)} of ${countText(whole)}`;

const singleAgentSentence = (single: OutageAnswers): string =>
    `Single-agent: ${ofRuns(single.declined, single.runs)} answers declined, ` +
    `${countText(single.declinedButNamedGold)} of them still named the right answer further on, and ` +
    `${countText(single.answeredFromWorkingCalls + single.answeredWithoutWorkingCalls)} answered.`;

const multiAgentSentence = (multi: OutageAnswers): string =>
    `Multi-agent: ${ofRuns(multi.declined, multi.runs)} supervisor answers declined, and ` +
    `${countText(multi.declinedButNamedGold)} of those still named the right answer further on, read in each answer as ` +
    'a likely or general-knowledge guess labelled unverified, or as the entry to look up on a retry; ' +
    `${countText(multi.answeredFromWorkingCalls)} answered from tool calls that worked (the checker's source reads: the ` +
    `outage hits search only), and ${countText(multi.answeredWithoutWorkingCalls)} answered with every call failed.`;

/**
 * What the recorded answers did when search was down, counted from the traces: an answer declined when its last
 * step opens by abstaining. How a declining answer still named the gold answer was read in each answer, not inferred
 * by the count, and holds for the committed recording this block is rendered for.
 */
export const outageLesson = (answers: readonly OutageAnswers[]): string => {
    const single = answers.find((tally) => tally.variation === searchOutage);
    const multi = answers.find((tally) => tally.variation === multiAgentSearchOutage);
    const answeredBlind = answers.some((tally) => tally.answeredWithoutWorkingCalls > 0);
    const heading = answeredBlind
        ? 'Under a full search outage, some answers rested on no working call: read them.'
        : 'Under a full search outage, the model did not pass off a guess as found.';
    return (
        `- **${heading}** ` +
        [single === undefined ? '' : singleAgentSentence(single), multi === undefined ? '' : multiAgentSentence(multi)]
            .filter((sentence) => sentence.length > 0)
            .join(' ')
    );
};
