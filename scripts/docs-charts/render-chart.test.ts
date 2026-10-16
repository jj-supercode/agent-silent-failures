import { describe, expect, test } from 'vitest';

import { renderChart } from './render-chart.ts';
import { sampleChartSpec } from './testing.ts';
import { chartThemes } from './themes.ts';

const svg = renderChart(sampleChartSpec, chartThemes.light);
const occurrences = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

describe('renderChart', () => {
    test('is an accessible image: labelled by its escaped title and a description holding every value', () => {
        expect(svg).toContain('role="img"');
        expect(svg).toContain('aria-labelledby="live-run-lessons-title live-run-lessons-description"');
        expect(svg).toContain('<title id="live-run-lessons-title">Before &amp; after</title>');
        expect(svg).toContain('tool-loop: First scoring 9/312, 2.9% (95% CI 1.5% to 5.4%); Now 0/312, 0.0%');
        expect(svg).toContain('embedding-coverage: First scoring: not recordable.');
    });

    test('draws one dot per estimate plus one legend swatch per series, and prints each labelled value', () => {
        expect(occurrences(svg, /<circle /g)).toBe(2 + 2);
        expect(svg).toContain('>2.9% (9/312)</text>');
        expect(svg).toContain('>0.0% (0/312)</text>');
    });

    test('says why a series has no value instead of leaving a gap', () => {
        expect(svg).toContain('>not recordable</text>');
    });

    test('a single series has no legend: the title names it', () => {
        const single = renderChart(
            { ...sampleChartSpec, series: sampleChartSpec.series.slice(0, 1), panels: [] },
            chartThemes.light,
        );
        expect(occurrences(single, /<circle /g)).toBe(0);
    });

    test('each theme paints its own surface and the same structure', () => {
        const dark = renderChart(sampleChartSpec, chartThemes.dark);
        expect(dark).toContain(`fill="${chartThemes.dark.surface}"`);
        expect(dark.replaceAll(/#[0-9a-f]{6}/g, '')).toBe(svg.replaceAll(/#[0-9a-f]{6}/g, ''));
    });

    test('renders the same bytes from the same spec', () => {
        expect(renderChart(sampleChartSpec, chartThemes.light)).toBe(svg);
    });
});
