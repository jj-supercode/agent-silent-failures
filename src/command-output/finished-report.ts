import type { CommandReport } from './model.ts';

/** A report with what the output measured itself: how long the command took and its peak memory. */
export type FinishedReport = CommandReport & { readonly elapsedMs: number; readonly peakRssBytes: number };

export const isSuccess = (report: CommandReport): boolean => report.exit.code === 0;
