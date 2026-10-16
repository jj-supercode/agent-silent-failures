import { percentText } from '../../command-output/index.ts';
import type { EntryId } from '../../entries/index.ts';
import type {
    BedReport,
    ConfusionRow,
    DetectorReport,
    HeadlineRow,
    Rate,
    ReportProvenance,
    SensitivityPoint,
    SplitReport,
    ThresholdSensitivity,
} from '../model.ts';
import { markdownTable, type TableColumn } from './markdown-table.ts';
import { provenanceLine } from './provenance-line.ts';
import { catchLine, countCell, rateLine, shareCell } from './rate-text.ts';

type FiredByEntry = Pick<HeadlineRow, 'firedByEntry'>;

const firedRate = (row: FiredByEntry, entryId: EntryId): Rate | undefined =>
    row.firedByEntry.find((cell) => cell.entryId === entryId)?.fired;

const entryColumns = <TRow extends FiredByEntry>(
    entryIds: readonly EntryId[],
    cellFor: (rate: Rate, row: TRow, entryId: EntryId) => string,
): readonly TableColumn<TRow>[] =>
    entryIds.map((entryId) => ({
        header: entryId,
        cell: (row) => {
            const rate = firedRate(row, entryId);
            return rate === undefined ? '-' : cellFor(rate, row, entryId);
        },
        align: 'right',
    }));

const headlineTable = (rows: readonly HeadlineRow[], entryIds: readonly EntryId[]): string =>
    markdownTable<HeadlineRow>(
        [
            { header: 'condition', cell: (row) => row.condition },
            { header: 'agent runs', cell: (row) => String(row.agentRuns), align: 'right' },
            ...entryColumns<HeadlineRow>(entryIds, shareCell),
            { header: 'gold answer found', cell: (row) => shareCell(row.goldAnswerFound), align: 'right' },
            {
                header: 'gold sentence recall@k',
                cell: (row) => (row.meanGoldSentenceRecall === null ? '-' : percentText(row.meanGoldSentenceRecall)),
                align: 'right',
            },
        ],
        rows,
    );

const confusionTable = (rows: readonly ConfusionRow[], entryIds: readonly EntryId[]): string =>
    markdownTable<ConfusionRow>(
        [
            { header: 'condition', cell: (row) => row.condition },
            ...entryColumns<ConfusionRow>(entryIds, (rate, row, entryId) =>
                row.ownEntryId === entryId ? `**${countCell(rate)}**` : countCell(rate),
            ),
        ],
        rows,
    );

const detectorSection = (detector: DetectorReport): string =>
    [
        `#### ${detector.entryId}`,
        '',
        `- ${catchLine(detector)}` +
            (detector.notApplicableOnFaulted === 0 ? '' : ` (not applicable: ${detector.notApplicableOnFaulted})`),
        ...detector.caughtBySeverity.map(
            (severity) => `  - ${severity.faultId} / ${severity.severity}: ${catchLine(severity)}`,
        ),
        `- ${rateLine('false alarms', detector.falseAlarms)}`,
        ...detector.falseAlarmsByVariation.map(
            (variation) =>
                `  - ${variation.hardNegative ? 'hard negative ' : ''}${variation.variation}: ` +
                rateLine('false alarms', variation.falseAlarms) +
                (variation.notApplicable === 0 ? '' : ` (not applicable: ${variation.notApplicable})`),
        ),
    ].join('\n');

const sensitivityTable = (sweeps: readonly ThresholdSensitivity[]): string =>
    markdownTable<ThresholdSensitivity & { readonly point: SensitivityPoint }>(
        [
            { header: 'entry', cell: (row) => row.entryId },
            { header: 'threshold', cell: (row) => row.threshold },
            {
                header: 'value',
                cell: (row) => `${row.point.value}${row.point.isDefault ? ' (default)' : ''}`,
                align: 'right',
            },
            {
                header: 'caught (expressed runs)',
                cell: (row) => `${countCell(row.point.caught)} ${shareCell(row.point.caught)}`,
            },
            {
                header: 'false alarms (judged clean runs)',
                cell: (row) => `${countCell(row.point.falseAlarms)} ${shareCell(row.point.falseAlarms)}`,
            },
        ],
        sweeps.flatMap((sweep) => sweep.points.map((point) => ({ ...sweep, point }))),
    );

/** `Held-out split: 147 agent runs, 96 ingestions`: the heading of a split in reports and on the console. */
export const splitTitle = (split: SplitReport): string =>
    `${split.split === 'held-out' ? 'Held-out' : 'Dev'} split: ${split.agentRuns} agent runs, ${split.ingestions} ingestions`;

/** The headline table and the per-detector rate lines: what `pnpm bed` prints. */
export const renderSummary = (split: SplitReport): string => {
    const entryIds = split.detectors.map((detector) => detector.entryId);
    return [
        `## ${splitTitle(split)}`,
        '',
        '### Headline (share of scored runs each detector fired on: agent runs for run entries, ingestions for ' +
            'embedding-coverage; recall@k at the family top K)',
        '',
        headlineTable(split.headline, entryIds),
        '',
        '### Per detector',
        '',
        split.detectors.map(detectorSection).join('\n\n'),
    ].join('\n');
};

const renderSplit = (split: SplitReport): string => {
    const entryIds = split.detectors.map((detector) => detector.entryId);
    return [
        renderSummary(split),
        '',
        '### Cross-fault matrix (fired / scored runs; own fault in bold)',
        '',
        confusionTable(split.confusion, entryIds),
        '',
        '### Threshold sensitivity (one threshold at a time, the others at their defaults)',
        '',
        sensitivityTable(split.sensitivity),
    ].join('\n');
};

export const renderMarkdownReport = (report: BedReport, provenance: ReportProvenance): string =>
    [
        '# Detector test bed results',
        '',
        provenanceLine(provenance),
        '',
        "Catch rate counts every run of an entry's own faults (a not-applicable verdict is a miss); where a fault " +
            'changed nothing observable on some runs (not expressed), the rate over the other runs follows. ' +
            'False-alarm rate counts the clean runs a detector judged. Intervals are Wilson 95% score intervals.',
        '',
        report.splits.map(renderSplit).join('\n\n'),
        '',
    ].join('\n');
