import { axisTicks, plotRange, shareToX, tickLabel } from './axis-scale.ts';
import { chartLayout, stackBlocks, type Block } from './chart-layout.ts';
import type { ChartPanel, ChartRow, ChartTheme } from './model.ts';
import { markAt, type PanelContext } from './render-marks.ts';
import { element, textElement } from './svg-markup.ts';
import { wrapWords } from './wrap-words.ts';

/** Marks of one row, in the order given, spread around the row's centre line. */
const rowMarks = (context: PanelContext, row: ChartRow, centre: number): readonly string[] => {
    const offset = ((row.marks.length - 1) * chartLayout.seriesGap) / 2;
    return row.marks.map((mark, index) => markAt(context, mark, centre - offset + index * chartLayout.seriesGap));
};

const rowBlock =
    (context: PanelContext, row: ChartRow): Block =>
    (top) => {
        const labelLines = wrapWords(row.label, chartLayout.rowLabelCharacters);
        const height =
            Math.max(labelLines.length * chartLayout.lineHeight, row.marks.length * chartLayout.seriesGap) +
            chartLayout.rowPadding * 2;
        const centre = top + height / 2;
        const firstBaseline =
            centre - ((labelLines.length - 1) * chartLayout.lineHeight) / 2 + chartLayout.baselineToCentre;
        return {
            markup: [
                ...labelLines.map((line, index) =>
                    textElement(
                        {
                            x: chartLayout.margin,
                            y: firstBaseline + index * chartLayout.lineHeight,
                            fill: context.theme.secondaryInk,
                            'font-size': chartLayout.textSize,
                        },
                        line,
                    ),
                ),
                ...rowMarks(context, row, centre),
            ],
            height,
        };
    };

const headingBlock =
    (context: PanelContext): Block =>
    (top) => {
        const tickBaseline = top + chartLayout.lineHeight + chartLayout.smallSize + chartLayout.tickRowGap;
        return {
            markup: [
                textElement(
                    {
                        x: chartLayout.margin,
                        y: top + chartLayout.textSize,
                        fill: context.theme.primaryInk,
                        'font-size': chartLayout.textSize,
                        'font-weight': 600,
                    },
                    context.panel.heading,
                ),
                ...axisTicks(context.panel.axisMax).map((tick) =>
                    textElement(
                        {
                            x: shareToX(tick, context.panel.axisMax, plotRange),
                            y: tickBaseline,
                            fill: context.theme.mutedInk,
                            'font-size': chartLayout.smallSize,
                            'text-anchor': 'middle',
                        },
                        tickLabel(tick),
                    ),
                ),
            ],
            height: tickBaseline - top + chartLayout.tickRowPadding,
        };
    };

const gridlines = (context: PanelContext, top: number, bottom: number): readonly string[] =>
    axisTicks(context.panel.axisMax).map((tick) => {
        const x = shareToX(tick, context.panel.axisMax, plotRange);
        return element('line', {
            x1: x,
            x2: x,
            y1: top,
            y2: bottom,
            stroke: context.theme.gridline,
            'stroke-width': 1,
        });
    });

/** A panel: its heading with the axis's tick labels, hairline gridlines, then one band per row. */
export const panelBlock =
    (panel: ChartPanel, theme: ChartTheme): Block =>
    (top) => {
        const context: PanelContext = { panel, theme };
        const heading = headingBlock(context)(top);
        const rows = stackBlocks(
            panel.rows.map((row) => rowBlock(context, row)),
            top + heading.height,
        );
        return {
            markup: [...heading.markup, ...gridlines(context, top + heading.height, rows.bottom), ...rows.markup],
            height: rows.bottom - top,
        };
    };
