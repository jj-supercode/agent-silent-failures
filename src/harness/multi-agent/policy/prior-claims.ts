import type { SourceId } from '../../../trace/index.ts';
import type { Draw } from '../../policy/model.ts';
import { pickWithDraw } from '../../policy/seeded-draw.ts';

/**
 * Confident claims a supervisor could make from its own prior instead of its workers' results. Each names a place
 * or person and a year that the committed corpus never mentions (a unit test checks), so an answer built from one
 * shares no fact with any worker.
 */
const priorClaims: readonly [(subject: SourceId) => string, ...((subject: SourceId) => string)[]] = [
    (subject) => `${subject} is best known for its link to Port Moresby, founded in 1683.`,
    (subject) => `Records place ${subject} in Saskatoon around 1758.`,
    (subject) => `${subject} was first documented by Ingrid Vasquez-Tolland in 1611.`,
];

export const priorClaim = (subject: SourceId, draw: Draw): string =>
    pickWithDraw(priorClaims, draw('prior-claim'))(subject);
