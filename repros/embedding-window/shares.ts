import { roundTo } from './rounding.ts';

export const shareOf = (part: number, whole: number): number => roundTo(whole === 0 ? 0 : part / whole, 4);

/** `0.2788` as `27.88%`; formats instead of multiplying, so float noise never reaches a report. */
export const percentText = (share: number): string => `${(share * 100).toFixed(2)}%`;
