import { percentText, textTable, type TextStyle } from '../../command-output/index.ts';
import type { DetectorReport, Rate, SplitReport } from '../model.ts';

const rateCountCell = (rate: Rate): string => (rate.trials === 0 ? 'no runs' : `${rate.events}/${rate.trials}`);

const shareCell = (rate: Rate): string => (rate.share === null ? '' : percentText(rate.share));

const intervalCell = (rate: Rate): string =>
    rate.interval === null ? '' : `[${percentText(rate.interval.lower)}, ${percentText(rate.interval.upper)}]`;

const notExpressedMark = '*';

const catchCells = (detector: DetectorReport, style: TextStyle): readonly string[] => {
    const { caught } = detector;
    const complete = caught.share === 1;
    const mark = detector.notExpressed === 0 ? '' : notExpressedMark;
    return [
        `${rateCountCell(caught)}${mark}`,
        complete ? style.success(shareCell(caught)) : style.warning(shareCell(caught)),
        style.muted(intervalCell(caught)),
    ];
};

const falseAlarmCells = (detector: DetectorReport, style: TextStyle): readonly string[] => {
    const { falseAlarms } = detector;
    const quiet = falseAlarms.events === 0;
    return [
        rateCountCell(falseAlarms),
        quiet ? style.success(shareCell(falseAlarms)) : style.failure(shareCell(falseAlarms)),
        style.muted(intervalCell(falseAlarms)),
    ];
};

const footnotes = (split: SplitReport): readonly string[] =>
    split.detectors
        .filter((detector) => detector.notExpressed > 0)
        .map(
            (detector) =>
                `${notExpressedMark} ${detector.entryId}: on ${detector.notExpressed} runs the fault changed nothing ` +
                `observable; caught when expressed ${rateCountCell(detector.caughtWhenExpressed)} = ` +
                `${shareCell(detector.caughtWhenExpressed)}`,
        );

/**
 * One row per detector: catches over its own fault runs and false alarms over the clean runs it judged, each with
 * its Wilson 95% interval. The full tables are in the markdown report.
 */
export const detectorTableLines = (split: SplitReport, style: TextStyle): readonly string[] => [
    ...textTable(
        [
            { header: 'detector', align: 'left' },
            { header: 'caught', align: 'right' },
            { header: '', align: 'right' },
            { header: '95% interval', align: 'left' },
            { header: 'false alarms', align: 'right' },
            { header: '', align: 'right' },
            { header: '95% interval', align: 'left' },
        ],
        split.detectors.map((detector) => [
            detector.entryId,
            ...catchCells(detector, style),
            ...falseAlarmCells(detector, style),
        ]),
        style.label,
    ),
    ...footnotes(split),
];
