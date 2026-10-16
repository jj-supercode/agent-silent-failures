import { fileURLToPath } from 'node:url';

import { corpusFailure, planRuns } from '../bed/index.ts';
import {
    displayPath,
    runCommand,
    stoppedReport,
    type CommandFailure,
    type CommandOutput,
    type CommandReport,
    type ExitCode,
} from '../command-output/index.ts';
import { loadQuestions } from '../corpus/index.ts';
import { guardedProcessEnvironment } from '../record/index.ts';
import { decidePreflight, preflightLines, type PreflightDecision } from './budget/preflight.ts';
import { liveExitCodeRegistry } from './exit-codes.ts';
import { liveCommand } from './live-command.ts';
import type { LiveOptions } from './live-options.ts';
import { loadSessionModels } from './load-session-models.ts';
import { planDescriptionLines } from './plan-text.ts';
import { plannedSpend } from './planned-spend.ts';
import { recordWithProgress } from './record-with-progress.ts';
import { budgetCounts, overBudgetReason, recordedSessionReport, sessionHeader } from './session-console.ts';
import { liveSplit, planSession, resumeCommand } from './session-plan.ts';
import { formatSpend, spendContextOf } from './spend-summary.ts';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

/** A session that stopped before recording anything: the failure, then a report carrying the pre-flight. */
const refusedAfterPreflight = (
    output: CommandOutput,
    preflight: PreflightDecision,
    exit: ExitCode,
    failure: Omit<CommandFailure, 'subject'>,
): CommandReport => {
    output.failure({ subject: null, ...failure });
    return { ...stoppedReport(exit, `refused: ${failure.what}; nothing was sent`), counts: budgetCounts(preflight) };
};

/** Returns the report; returning (not exiting) lets every `await using` dispose its harness. */
const runLiveSession = async (options: LiveOptions, output: CommandOutput): Promise<CommandReport> => {
    const corpus = await loadQuestions();
    if (corpus.kind === 'failed') {
        output.failure(corpusFailure(corpus.failure));
        return stoppedReport(liveExitCodeRegistry.corpusUnreadable, 'cannot read the question corpus');
    }
    const planning = await planSession(planRuns(corpus.questions, { split: liveSplit, entryId: null }), options);
    switch (planning.kind) {
        case 'resume-refused':
            output.failure({
                subject: displayPath(repositoryRoot, planning.directory),
                what: 'cannot resume the recording',
                why: `${planning.reason}; nothing was sent or written`,
                fix: 'record a new set with pnpm demo:live --out <dir>, or resume from the checkout that recorded it',
            });
            return stoppedReport(liveExitCodeRegistry.resumeRefused, 'resume refused; nothing was sent');
        case 'nothing-to-resume':
            return stoppedReport(
                liveExitCodeRegistry.done,
                `nothing to resume: all ${planning.completedRuns} runs of ${planning.directory} completed`,
            );
        case 'planned':
            break;
        default:
            return planning satisfies never;
    }
    const { plan } = planning;
    const preflight = decidePreflight(plannedSpend(plan.runs, options.judge), options.maxUsd, plan.history.spend.spent);
    output.start(sessionHeader(options, plan.runs.length, preflight));
    output.section('Plan', planDescriptionLines(plan.description));
    output.section('Budget pre-flight (the most the guard lets each run spend)', preflightLines(preflight));
    if (preflight.kind === 'over-cap') {
        return refusedAfterPreflight(output, preflight, liveExitCodeRegistry.overBudget, {
            what: 'over budget',
            why: overBudgetReason(preflight),
            fix: 'raise --max-usd, or record fewer runs with --max-runs',
        });
    }
    // The key is loaded before the fixture directory is touched, so a refused start leaves nothing behind.
    const loaded = await loadSessionModels(options);
    if (loaded.kind === 'no-key') {
        return refusedAfterPreflight(output, preflight, liveExitCodeRegistry.missingApiKey, {
            what: 'no API key',
            why: loaded.reason,
            fix: 'set ANTHROPIC_API_KEY in .env, or rehearse for free with pnpm demo:live --dry-run',
        });
    }
    const { models } = loaded;
    const opened = await plan.open(models, new Date());
    if (opened.kind === 'exists') {
        return refusedAfterPreflight(output, preflight, liveExitCodeRegistry.fixturesExist, {
            what: 'a recording already exists',
            why: `${displayPath(repositoryRoot, opened.directory)} already holds a recording`,
            fix: `${resumeCommand(options, opened.directory)} re-runs its failed and missing runs, or pass --out <dir>`,
        });
    }
    const { outcome, spend } = await recordWithProgress(options, output, {
        directory: opened.directory,
        runs: plan.runs,
        models,
        cap: options.maxUsd,
        manifestBase: opened.base,
        history: plan.history,
        spendContext: spendContextOf(options, preflight.estimate.worstCase),
        environment: guardedProcessEnvironment(),
    });
    const directory = displayPath(repositoryRoot, opened.directory);
    output.section('Spend', [formatSpend(spend, plan.history.spend)]);
    if (outcome.stoppedEarly !== null) {
        output.failure({
            subject: directory,
            what: 'the session stopped early',
            why: `${outcome.stoppedEarly}; everything recorded is replayable`,
            fix: `${resumeCommand(options, opened.directory)} records the rest`,
        });
    }
    return recordedSessionReport({
        options,
        plannedRuns: plan.runs.length,
        preflight,
        outcome,
        spend,
        directory,
        fixtureDirectory: opened.directory,
    });
};

process.exitCode = await runCommand(liveCommand, process.argv.slice(2), runLiveSession);
