import { duplicateCosineTolerance } from '../../ingestion/index.ts';
import type { Vector } from './model.ts';

const norm = (vector: Vector): number => Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

export const cosineSimilarity = (left: Vector, right: Vector): number =>
    left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0) / (norm(left) * norm(right));

/** Same embedding up to float noise: the cosine distance tolerance the published ingestion module uses. */
export const isSameEmbedding = (left: Vector, right: Vector): boolean =>
    1 - cosineSimilarity(left, right) <= duplicateCosineTolerance;
