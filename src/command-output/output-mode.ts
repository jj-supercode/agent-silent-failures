import { outputModeNames, type OutputMode, type OutputModeName } from './model.ts';

/** Picks the mode for every command without a flag: `human`, `plain` or `json`. */
export const outputModeVariable = 'AGENT_SILENT_FAILURES_OUTPUT';

export type OutputModeRequest = {
    /** `--json` or `--plain`; `null` when neither was passed. */
    readonly flag: OutputModeName | null;
    readonly environment: Readonly<Record<string, string | undefined>>;
    readonly stdoutIsTerminal: boolean;
    readonly stderrIsTerminal: boolean;
};

export type OutputModeResolution =
    { readonly kind: 'resolved'; readonly mode: OutputMode } | { readonly kind: 'invalid'; readonly reason: string };

const isOutputModeName = (value: string): value is OutputModeName => outputModeNames.some((name) => name === value);

/** `FORCE_COLOR=0` (or `false`) turns colour off like `NO_COLOR`; any other value forces it on. */
const forcedColor = (environment: OutputModeRequest['environment']): boolean | null => {
    const force = environment.FORCE_COLOR;
    return force === undefined ? null : force !== '0' && force !== 'false';
};

const isSet = (value: string | undefined): boolean => value !== undefined && value !== '';

/**
 * Colour follows the no-color.org and FORCE_COLOR conventions; progress is rewritten in place only on a terminal,
 * since a rewritten line in a log file is noise.
 */
const humanMode = (request: OutputModeRequest): OutputMode => ({
    kind: 'human',
    color: forcedColor(request.environment) ?? (!isSet(request.environment.NO_COLOR) && request.stdoutIsTerminal),
    rewritesProgress: request.stderrIsTerminal,
});

const modeNamed = (name: OutputModeName, request: OutputModeRequest): OutputMode => {
    switch (name) {
        case 'human':
            return humanMode(request);
        case 'plain':
            return { kind: 'plain' };
        case 'json':
            return { kind: 'json' };
        default:
            return name satisfies never;
    }
};

/** A terminal outside CI gets the human mode; a pipe, a file, CI or a forced colour without a terminal gets plain. */
const detectedModeName = (request: OutputModeRequest): OutputModeName =>
    request.stdoutIsTerminal && !isSet(request.environment.CI) ? 'human' : 'plain';

/** Precedence: the flag, then `AGENT_SILENT_FAILURES_OUTPUT`, then detection. */
export const resolveOutputMode = (request: OutputModeRequest): OutputModeResolution => {
    const variable = request.environment[outputModeVariable] ?? '';
    if (request.flag !== null) {
        return { kind: 'resolved', mode: modeNamed(request.flag, request) };
    }
    if (variable === '') {
        return { kind: 'resolved', mode: modeNamed(detectedModeName(request), request) };
    }
    return isOutputModeName(variable)
        ? { kind: 'resolved', mode: modeNamed(variable, request) }
        : {
              kind: 'invalid',
              reason: `${outputModeVariable} must be one of ${outputModeNames.join(', ')}, not "${variable}"`,
          };
};
