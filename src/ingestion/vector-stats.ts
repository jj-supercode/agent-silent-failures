import { vectorStatsSchema, type VectorStats } from '../trace/model.ts';

/** Two vectors closer than this in cosine distance count as the same embedding (float32 noise level). */
export const duplicateCosineTolerance = 1e-6;

/**
 * Unit vectors within `duplicateCosineTolerance` are at most this far apart (|u - v|² = 2 × cosine distance), so
 * each of their components differs by at most this much too: grid cells this wide never split a duplicate pair by
 * more than one cell per axis.
 */
const cellWidth = Math.sqrt(2 * duplicateCosineTolerance);

/** Axes the grid spans: enough to spread real embeddings thinly, few enough that 3^axes neighbour cells stay cheap. */
const gridAxes = 4;

export type EmbeddedText = { readonly text: string; readonly vector: readonly number[] };

type UnitText = {
    readonly index: number;
    readonly text: string;
    readonly unit: readonly number[];
    readonly cell: readonly number[];
};

const norm = (vector: readonly number[]): number =>
    Math.sqrt(vector.reduce((sum, component) => sum + component * component, 0));

const dot = (left: readonly number[], right: readonly number[]): number =>
    left.reduce((sum, component, index) => sum + component * (right[index] ?? 0), 0);

const toUnitText = ({ text, vector }: EmbeddedText, index: number): UnitText => {
    const length = norm(vector);
    const unit = vector.map((component) => component / length);
    return { index, text, unit, cell: unit.slice(0, gridAxes).map((component) => Math.floor(component / cellWidth)) };
};

const cellKey = (cell: readonly number[]): string => cell.join(',');

/** Every offset in {-1, 0, 1} per axis: the cell itself and all cells touching it. */
const neighbourOffsets = (axes: number): readonly (readonly number[])[] =>
    axes === 0 ? [[]] : neighbourOffsets(axes - 1).flatMap((offset) => [-1, 0, 1].map((step) => [...offset, step]));

const isDuplicate = (left: UnitText, right: UnitText): boolean =>
    left.text !== right.text && 1 - dot(left.unit, right.unit) <= duplicateCosineTolerance;

/**
 * Counts vectors that repeat an earlier vector (in input order) although their text differs: the trace of a lost
 * tail. Exact, and near-linear on real embeddings: only vectors in touching grid cells can be duplicates.
 */
const countDuplicatesOfDistinctText = (embedded: readonly UnitText[]): number => {
    const byCell = Map.groupBy(embedded, (entry) => cellKey(entry.cell));
    const offsets = neighbourOffsets(Math.min(gridAxes, embedded[0]?.cell.length ?? 0));
    return embedded.filter((current) =>
        offsets.some((offset) =>
            (byCell.get(cellKey(current.cell.map((coordinate, axis) => coordinate + (offset[axis] ?? 0)))) ?? []).some(
                (earlier) => earlier.index < current.index && isDuplicate(earlier, current),
            ),
        ),
    ).length;
};

/** Zero-norm, non-finite and duplicated vectors among the embedded chunks, in the shape the ingestion report holds. */
export const summarizeVectors = (embedded: readonly EmbeddedText[]): VectorStats => {
    const finite = embedded.filter(({ vector }) => vector.every(Number.isFinite));
    const nonZero = finite.filter(({ vector }) => norm(vector) > 0);
    return vectorStatsSchema.parse({
        zeroNormCount: finite.length - nonZero.length,
        nonFiniteCount: embedded.length - finite.length,
        duplicateOfDistinctTextCount: countDuplicatesOfDistinctText(nonZero.map(toUnitText)),
    });
};
