import { createHash } from 'node:crypto';

import { unitIntervalSchema, type UnitInterval } from '../../trace/index.ts';
import type { Draw } from './model.ts';

const drawBytes = 6;
const drawRange = 2 ** (drawBytes * 8);

/** Stateless seeded randomness: each draw hashes the seed, its scope and its label, so draw order never matters. */
export const createDraw =
    (seed: number, scope: readonly (string | number)[]): Draw =>
    (label) =>
        unitIntervalSchema.parse(
            createHash('sha256')
                .update([seed, ...scope, label].join('\u0000'))
                .digest()
                .readUIntBE(0, drawBytes) / drawRange,
        );

export const pickWithDraw = <T>(options: readonly [T, ...T[]], draw: UnitInterval): T =>
    options[Math.min(Math.floor(draw * options.length), options.length - 1)] ?? options[0];
