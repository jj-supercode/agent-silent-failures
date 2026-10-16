import { countText } from '../../src/command-output/index.ts';
import {
    ignoredWorkerResultEntryId,
    swallowedToolErrorEntryId,
    toolLoopEntryId,
    toolLoopThresholds,
} from '../../src/entries/index.ts';
import { multiAgentBaseline, parallelRetryPrefix, retryBeyondBudgetSeverity, searchOutage } from './lesson-subjects.ts';
import type { Rate, SplitReport } from './model.ts';
import { rateCell } from './number-text.ts';
import type { OutageAnswers } from './outage-answers.ts';
import { outageLesson } from './render-outage-lesson.ts';
import {
    catchSentence,
    comparisonTable,
    compareScorings,
    type Scoring,
    type ScoringComparison,
} from './render-scoring-comparison.ts';
import {
    detectorOf,
    falseAlarmsOf,
    falseAlarmsOnVariation,
    falseAlarmsUnderErrors,
    falseAlarmsWhere,
    goldFoundOn,
    goldFoundOnCleanRuns,
} from './report-queries.ts';

export type LiveLessonsInput = {
    readonly firstScoring: Scoring;
    readonly currentScoring: Scoring;
    readonly outageAnswers: readonly OutageAnswers[];
};

/** The scripted checks of the retry rule, once the offline report holds them. */
const scriptedRetryChecks = (offlineHeldOut: SplitReport | undefined): string => {
    const toolLoop = detectorOf(offlineHeldOut, toolLoopEntryId);
    const beyondBudget = toolLoop?.caughtBySeverity.find((entry) => entry.severity === retryBeyondBudgetSeverity);
    if (toolLoop === undefined || beyondBudget === undefined) {
        return '';
    }
    const hardNegative = falseAlarmsWhere(toolLoop, (variation) => variation.startsWith(parallelRetryPrefix));
    return hardNegative.trials === 0
        ? ''
        : ' The scripted bed checks the rule both ways: the hard negative `parallel-retry` replays the pattern ' +
              `(false alarms ${rateCell(hardNegative)}), and the new fault severity \`${retryBeyondBudgetSeverity}\` ` +
              `loops on a search that always fails (caught ${rateCell(beyondBudget.caught)}).`;
};

const parallelRetryLesson = ({ first, currentOffline }: ScoringComparison): string =>
    '- **Parallel retries are not loops.** The model sends two searches at once. When both return an error ' +
    'payload it re-issues both, so the trace reads A, B, A, B, and `tool-loop` called that a cycle on ' +
    `${countText(falseAlarmsUnderErrors(first, toolLoopEntryId).events)} clean runs under search errors. A call that ` +
    're-issues a failed call is now a retry. A streak of up to `MAX_RETRIES` retries ' +
    `(${countText(toolLoopThresholds.MAX_RETRIES.value)}, a prior: that many retries after an error is normal recovery) ` +
    'is left out of the loop count; a longer streak counts in full, and so does every repeat after a usable ' +
    `result.${scriptedRetryChecks(currentOffline)}`;

const supervisorLesson = ({ first }: ScoringComparison): string =>
    '- **A supervisor falling back is not ignoring a worker.** Workers whose every search failed said so; the ' +
    "supervisor then abstained, answered from the checker's own source reads, or gave a guess it labelled " +
    'unverified. `ignored-worker-result` counted the failed replies as facts the answer had to use, and read ' +
    'spelling as invented facts: a possessive ("The Ring\'s") and an ordinary word capitalised after a colon ' +
    `("The Ring: Probably yes"). It fired on ${countText(falseAlarmsOf(first, ignoredWorkerResultEntryId).events)} ` +
    `clean runs, ${countText(falseAlarmsOnVariation(first, ignoredWorkerResultEntryId, multiAgentBaseline).events)} ` +
    'of them on the plain multi-agent baseline, where the answers did use the workers. A worker whose every tool ' +
    'call failed now contributes no facts (a supervision whose every worker failed is not applicable, hence fewer ' +
    'judged runs), and fact words drop the possessive and treat the word after a colon like a sentence opener.';

const noHiddenFailureLesson = ({ current }: ScoringComparison): string =>
    '- **No answer hid a failure.** On the recorded clean runs that met a search error, `swallowed-tool-error` ' +
    `fired on ${rateCell(falseAlarmsUnderErrors(current, swallowedToolErrorEntryId))}: every answer admitted the ` +
    'failure, abstained, or rested on a call that worked.';

const denominatorChange = (before: Rate, after: Rate): string =>
    `${countText(before.trials)} to ${countText(after.trials)}`;

/** Why the gold-answer rows change denominator between the two scorings of the same runs. */
const goldDenominatorNote = ({ first, current }: ScoringComparison): string =>
    'Both gold-answer rows count only the runs where the metric can decide; the rewrite decides more yes/no ' +
    'answers, so the same runs give larger denominators ' +
    `(${denominatorChange(goldFoundOn(first, searchOutage), goldFoundOn(current, searchOutage))} on ` +
    `\`${searchOutage}\`, ${denominatorChange(goldFoundOnCleanRuns(first), goldFoundOnCleanRuns(current))} on all ` +
    'clean runs).';

const goldMetricLesson = (comparison: ScoringComparison): string =>
    '- **The quality column was fooled by abstentions.** "I have no passages about Hot Girls Wanted or China ' +
    'Blue" contains the gold answer of a comparison question, so `gold answer found` read ' +
    `${rateCell(goldFoundOn(comparison.first, searchOutage))} on recorded clean \`${searchOutage}\` runs although ` +
    `every answer declined; it now reads ${rateCell(goldFoundOn(comparison.current, searchOutage))}. Sentences that ` +
    'decline or report a failure no longer count, an answer whose last step opens by declining finds nothing, ' +
    'yes/no answers are read from their answer word, and a long name matches its usual short form ("Hector ' +
    `Berlioz" for "Louis-Hector Berlioz"). ${goldDenominatorNote(comparison)}`;

const introduction = (fixture: string): string =>
    `The first scoring of \`${fixture}\` found false alarms no scripted run had shown. Each one was read in its ` +
    'trace, and each fix is a rule about what agents do, tested first on scripted hard negatives and then on the ' +
    'recording. No threshold value was tuned; the one new parameter, `MAX_RETRIES`, is a prior. Every change was ' +
    "derived from this same recording: the two detector rules, how fact words are spelled and where an agent's " +
    'sentences break (Mastra glues step texts without a space), the added abstention phrases ("I could not ' +
    'search", "I could not check") and the gold-answer metric. So every recorded "Now" value, false alarms and ' +
    'gold answers alike, is in-sample: it shows the fixes work on the traces that revealed the problems, not how ' +
    'they generalise. A new recording is the out-of-sample check. The first scoring and the bed report of its time ' +
    'are kept in `results/replay/first-scoring/`.';

/**
 * Before and after on one recording: the first scoring against the current one, the scripted catch rates of the
 * changed entries at both times, and what reading the traces of the false alarms changed.
 */
export const liveLessonsBlock = (input: LiveLessonsInput): string => {
    const compared = compareScorings(input.firstScoring, input.currentScoring);
    if (compared.kind === 'not-comparable') {
        return compared.reason;
    }
    const { comparison } = compared;
    return [
        `${introduction(input.currentScoring.summary.fixture)} ${catchSentence(comparison)}`,
        '',
        comparisonTable(comparison),
        '',
        parallelRetryLesson(comparison),
        supervisorLesson(comparison),
        noHiddenFailureLesson(comparison),
        outageLesson(input.outageAnswers),
        goldMetricLesson(comparison),
    ].join('\n');
};
