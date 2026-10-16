import { plotRange, shareToX } from './axis-scale.ts';
import { chartLayout } from './chart-layout.ts';
import { estimateLabel, estimateReading } from './estimate-text.ts';
import type { ChartMark, ChartPanel, ChartSeries, ChartTheme, Estimate } from './model.ts';
import { element, escapeXml, textElement } from './svg-markup.ts';

/** What drawing inside a panel needs: the panel (its axis and labelling) and the theme. */
export type PanelContext = { readonly panel: ChartPanel; readonly theme: ChartTheme };

/** A surface-coloured outline under text inside the plot, so gridlines never cut through it. */
const surfaceHalo = (theme: ChartTheme) =>
    ({ stroke: theme.surface, 'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }) as const;

const whisker = (x: number, y: number, color: string): string =>
    element('line', {
        x1: x,
        x2: x,
        y1: y - chartLayout.whiskerHalfHeight,
        y2: y + chartLayout.whiskerHalfHeight,
        stroke: color,
        'stroke-width': chartLayout.markStroke,
        'stroke-linecap': 'round',
    });

const estimateMark = (context: PanelContext, series: ChartSeries, estimate: Estimate, y: number): string => {
    const { panel, theme } = context;
    const color = theme.categorical[series.slot];
    const lowerX = shareToX(estimate.lower, panel.axisMax, plotRange);
    const upperX = shareToX(estimate.upper, panel.axisMax, plotRange);
    const shareX = shareToX(estimate.share, panel.axisMax, plotRange);
    const valueLabel = panel.labelValues
        ? [
              textElement(
                  {
                      x: Math.max(upperX, shareX) + chartLayout.dotRadius + chartLayout.valueLabelGap,
                      y: y + chartLayout.baselineToCentre,
                      fill: theme.secondaryInk,
                      'font-size': chartLayout.valueLabelSize,
                      ...surfaceHalo(theme),
                  },
                  estimateLabel(estimate),
              ),
          ]
        : [];
    return element('g', {}, [
        element('title', {}, [escapeXml(`${series.name}: ${estimateReading(estimate)}`)]),
        element('line', {
            x1: lowerX,
            x2: upperX,
            y1: y,
            y2: y,
            stroke: color,
            'stroke-width': chartLayout.markStroke,
            'stroke-linecap': 'round',
        }),
        whisker(lowerX, y, color),
        whisker(upperX, y, color),
        element('circle', {
            cx: shareX,
            cy: y,
            r: chartLayout.dotRadius,
            fill: color,
            stroke: theme.surface,
            'stroke-width': chartLayout.surfaceRing,
        }),
        ...valueLabel,
    ]);
};

const missingMark = (context: PanelContext, note: string, y: number): string =>
    textElement(
        {
            x: chartLayout.plotLeft,
            y: y + chartLayout.baselineToCentre,
            fill: context.theme.mutedInk,
            'font-size': chartLayout.valueLabelSize,
            'font-style': 'italic',
            ...surfaceHalo(context.theme),
        },
        note,
    );

/** One mark at height `y`: an estimate's dot and interval, or the note that stands in for a missing value. */
export const markAt = (context: PanelContext, mark: ChartMark, y: number): string => {
    switch (mark.kind) {
        case 'estimate':
            return estimateMark(context, mark.series, mark.estimate, y);
        case 'missing':
            return missingMark(context, mark.note, y);
        default:
            return mark satisfies never;
    }
};
