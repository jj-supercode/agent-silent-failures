import { spawn } from 'node:child_process';

import { reproductionExitCodes } from '../shared/reproduction-outcome.ts';
import { reproScriptPath } from './reproduction-ids.ts';

export type ReproductionRun = {
    readonly reproductionId: string;
    readonly exitCode: number;
    readonly milliseconds: number;
    readonly output: string;
};

/** Runs one repro in its own Node process. Offline by construction: no provider key is passed on, telemetry is off. */
export const runReproduction = async (reproductionId: string): Promise<ReproductionRun> => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [reproScriptPath(reproductionId)], {
        env: { ...process.env, ANTHROPIC_API_KEY: '', MASTRA_TELEMETRY_DISABLED: '1' },
    });
    const output: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk));
    const exitCode = await new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? 1)));
    return {
        reproductionId,
        exitCode,
        milliseconds: performance.now() - startedAt,
        output: Buffer.concat(output).toString('utf8'),
    };
};

export type ReproductionVerdict = 'reproduces' | 'not-reproduced' | 'broken';

/** 0 and 10 are answers about Mastra; anything else means the repro itself broke and its output matters. */
export const reproductionVerdict = (exitCode: number): ReproductionVerdict => {
    switch (exitCode) {
        case reproductionExitCodes.reproduces:
            return 'reproduces';
        case reproductionExitCodes.notReproduced:
            return 'not-reproduced';
        default:
            return 'broken';
    }
};
