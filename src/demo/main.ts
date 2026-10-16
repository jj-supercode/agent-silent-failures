import {
    bedExitCodes,
    corpusFailure,
    detailLines,
    detectorTableLines,
    offlineStackFact,
    runBedWithProgress,
    scoredRunsReport,
    splitTitle,
    summarize,
} from '../bed/index.ts';
import {
    countedText,
    runCommand,
    stoppedReport,
    type CommandHeader,
    type CommandOutput,
    type CommandReport,
    type NextStep,
} from '../command-output/index.ts';
import { loadQuestions } from '../corpus/index.ts';
import { demoCommand, type DemoOptions } from './demo-command.ts';
import { demoQuestionCount, demoSpecs } from './demo-subset.ts';

const demoHeader = (plannedRuns: number): CommandHeader => ({
    title: 'agent-silent-failures demo',
    description:
        `${countedText(plannedRuns, 'run')}: every fault and clean variation on ${demoQuestionCount} held-out ` +
        'questions over their own documents.',
    measures: 'per detector, catches on its own faulted runs and false alarms on clean runs',
    total: plannedRuns,
    unit: 'runs',
    facts: [
        ['stack', offlineStackFact],
        ['scope', 'shows the mechanics; the published rates come from pnpm bed'],
    ],
});

const demoNextSteps = (options: DemoOptions): readonly NextStep[] => [
    { command: 'pnpm bed', purpose: 'the published rates: both splits over the full corpus, in minutes' },
    { command: 'pnpm replay', purpose: 'score the committed real-model traces, in seconds' },
    ...(options.details ? [] : [{ command: 'pnpm demo --details', purpose: 'every variation and fault' }]),
];

const runDemo = async (options: DemoOptions, output: CommandOutput): Promise<CommandReport> => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        output.failure(corpusFailure(loaded.failure));
        return stoppedReport(bedExitCodes.corpusUnreadable, 'cannot read the question corpus');
    }
    const specs = demoSpecs(loaded.questions, options.settings);
    output.start(demoHeader(specs.length));
    const outcome = await runBedWithProgress(specs, output);
    const report = summarize(outcome.runs);
    report.splits.forEach((split) => output.section(splitTitle(split), detectorTableLines(split, output.style)));
    if (options.details) {
        output.section('Details', detailLines(report));
    }
    return scoredRunsReport({ plannedRuns: specs.length, outcome, report, outputs: [], next: demoNextSteps(options) });
};

process.exitCode = await runCommand(demoCommand, process.argv.slice(2), runDemo);
