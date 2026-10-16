import { chartDescription } from './chart-description.ts';
import { chartLayout, gap, stackBlocks, type Block } from './chart-layout.ts';
import type { ChartSeries, ChartSpec, ChartTheme } from './model.ts';
import { panelBlock } from './render-panel.ts';
import { element, escapeXml, textElement } from './svg-markup.ts';
import { wrapWords } from './wrap-words.ts';

const textLines =
    (lines: readonly string[], fill: string, size: number, lineHeight: number): Block =>
    (top) => ({
        markup: lines.map((line, index) =>
            textElement({ x: chartLayout.margin, y: top + size + index * lineHeight, fill, 'font-size': size }, line),
        ),
        height: lines.length * lineHeight,
    });

const titleBlock =
    (spec: ChartSpec, theme: ChartTheme): Block =>
    (top) => ({
        markup: [
            textElement(
                {
                    x: chartLayout.margin,
                    y: top + chartLayout.titleSize,
                    fill: theme.primaryInk,
                    'font-size': chartLayout.titleSize,
                    'font-weight': 600,
                },
                spec.title,
            ),
        ],
        height: chartLayout.titleSize + chartLayout.titleGap,
    });

const legendItemWidth = (series: ChartSeries): number =>
    series.name.length * chartLayout.textCharacterWidth +
    chartLayout.dotRadius * 2 +
    chartLayout.legendSwatchGap +
    chartLayout.legendItemGap;

const legendItemStart = (series: readonly ChartSeries[], index: number): number =>
    chartLayout.margin + series.slice(0, index).reduce((total, item) => total + legendItemWidth(item), 0);

/** One swatch and name per series, in a row; a single series needs no legend, the title names it. */
const legendBlock =
    (series: readonly ChartSeries[], theme: ChartTheme): Block =>
    (top) => {
        if (series.length < 2) {
            return { markup: [], height: 0 };
        }
        const centre = top + chartLayout.lineHeight / 2;
        return {
            markup: series.flatMap((item, index) => {
                const x = legendItemStart(series, index);
                return [
                    element('circle', {
                        cx: x + chartLayout.dotRadius,
                        cy: centre,
                        r: chartLayout.dotRadius,
                        fill: theme.categorical[item.slot],
                    }),
                    textElement(
                        {
                            x: x + chartLayout.dotRadius * 2 + chartLayout.legendSwatchGap,
                            y: centre + chartLayout.baselineToCentre,
                            fill: theme.secondaryInk,
                            'font-size': chartLayout.textSize,
                        },
                        item.name,
                    ),
                ];
            }),
            height: chartLayout.lineHeight,
        };
    };

const chartBlocks = (spec: ChartSpec, theme: ChartTheme): readonly Block[] => [
    titleBlock(spec, theme),
    textLines(
        wrapWords(spec.subtitle, chartLayout.subtitleCharacters),
        theme.secondaryInk,
        chartLayout.textSize,
        chartLayout.lineHeight,
    ),
    gap(chartLayout.subtitleGap),
    legendBlock(spec.series, theme),
    ...spec.panels.flatMap((panel) => [gap(chartLayout.sectionGap), panelBlock(panel, theme)]),
    gap(chartLayout.sectionGap),
    textLines(
        wrapWords(spec.footnote, chartLayout.footnoteCharacters),
        theme.mutedInk,
        chartLayout.smallSize,
        chartLayout.smallLineHeight,
    ),
];

/**
 * One chart as a standalone SVG in one theme. The title and a text description with every value make it readable
 * without the picture; each mark also carries a tooltip.
 */
export const renderChart = (spec: ChartSpec, theme: ChartTheme): string => {
    const body = stackBlocks(chartBlocks(spec, theme), chartLayout.margin);
    const height = Math.ceil(body.bottom + chartLayout.margin);
    const titleId = `${spec.id}-title`;
    const descriptionId = `${spec.id}-description`;
    return `${element(
        'svg',
        {
            xmlns: 'http://www.w3.org/2000/svg',
            width: chartLayout.width,
            height,
            viewBox: `0 0 ${chartLayout.width} ${height}`,
            role: 'img',
            'aria-labelledby': `${titleId} ${descriptionId}`,
            'font-family': chartLayout.fontFamily,
        },
        [
            element('title', { id: titleId }, [escapeXml(spec.title)]),
            element('desc', { id: descriptionId }, [escapeXml(chartDescription(spec))]),
            element('rect', { width: chartLayout.width, height, fill: theme.surface }),
            ...body.markup,
        ],
    )}\n`;
};
