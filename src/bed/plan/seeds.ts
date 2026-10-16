import { createHash } from 'node:crypto';

/**
 * A stateless seed: sha256 of the labels that identify a run, read as an unsigned 32-bit integer. The same labels
 * always give the same seed on every platform, and no run's seed depends on run order.
 */
export const seedFor = (labels: readonly (string | number)[]): number =>
    createHash('sha256').update(labels.join('\u0000')).digest().readUInt32BE(0);
