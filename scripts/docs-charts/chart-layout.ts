/** Every fixed measure of a chart, in SVG pixels. Character budgets assume the system sans at each font size. */
export const chartLayout = {
    width: 800,
    margin: 24,
    plotLeft: 290,
    /** The space right of the plot holds value labels. */
    plotRight: 676,
    titleSize: 17,
    textSize: 13,
    smallSize: 11,
    lineHeight: 18,
    smallLineHeight: 15,
    subtitleCharacters: 112,
    footnoteCharacters: 136,
    rowLabelCharacters: 36,
    rowPadding: 10,
    seriesGap: 12,
    dotRadius: 5,
    surfaceRing: 2,
    markStroke: 2,
    whiskerHalfHeight: 4,
    /** Moves a text baseline down so the text sits centred on a mark's line. */
    baselineToCentre: 4,
    /** Between a mark's right end and its value label. */
    valueLabelGap: 6,
    valueLabelSize: 12,
    /** Between a legend swatch and its name, and after each legend item. */
    legendSwatchGap: 8,
    legendItemGap: 28,
    titleGap: 10,
    subtitleGap: 12,
    tickRowGap: 4,
    tickRowPadding: 6,
    sectionGap: 20,
    /** Average glyph width of `textSize` text, to space legend items. */
    textCharacterWidth: 6.7,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
} as const;

/** A horizontal band of the chart: placed at `top`, it reports its markup and how tall it is. */
export type Block = (top: number) => { readonly markup: readonly string[]; readonly height: number };

/** Places blocks one below the other from `top`; returns all markup and where the last block ends. */
export const stackBlocks = (
    blocks: readonly Block[],
    top: number,
): { readonly markup: readonly string[]; readonly bottom: number } =>
    blocks.reduce<{ readonly markup: readonly string[]; readonly bottom: number }>(
        (stacked, block) => {
            const placed = block(stacked.bottom);
            return { markup: [...stacked.markup, ...placed.markup], bottom: stacked.bottom + placed.height };
        },
        { markup: [], bottom: top },
    );

/** Vertical space between two blocks. */
export const gap =
    (height: number): Block =>
    () => ({ markup: [], height });
