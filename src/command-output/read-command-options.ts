import { z } from 'zod';

export type CommandOptions<T> =
    { readonly kind: 'parsed'; readonly options: T } | { readonly kind: 'invalid'; readonly reason: string };

const reasonOf = (error: unknown): string =>
    error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : String(error);

/**
 * Runs an argument parser that throws (`parseArgs` in strict mode, a zod `parse`) and returns its failure as a
 * value, so a command reports it in its output mode and exits instead of dying with a stack trace.
 */
export const readCommandOptions = <T>(parse: () => T): CommandOptions<T> => {
    try {
        return { kind: 'parsed', options: parse() };
    } catch (error) {
        return { kind: 'invalid', reason: reasonOf(error) };
    }
};
