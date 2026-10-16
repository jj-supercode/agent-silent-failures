import { errorStack, invalidArgumentsFailure, unexpectedErrorFailure } from './command-failures.ts';
import { processEnvironment, type CommandEnvironment } from './command-environment.ts';
import { createCommandOutput, type CommandOutput } from './command-output.ts';
import { routeConsoleToStderr } from './console-route.ts';
import { helpText, type CommandHelp } from './help-text.ts';
import { readInvocation } from './invocation.ts';
import type { CommandFailure, CommandReport, ExitCode } from './model.ts';
import type { CommandOptions } from './read-command-options.ts';

/** A command: its help, how it reads its own flags, and its exit codes. */
export type CommandDefinition<Options> = CommandHelp & {
    /** The `command` field of every JSON event, such as `demo`. */
    readonly name: string;
    /** Reads the command's own flags; a parser that throws can be wrapped with `readCommandOptions`. */
    readonly parseOptions: (args: readonly string[]) => CommandOptions<Options>;
};

export type CommandRun<Options> = (options: Options, output: CommandOutput) => Promise<CommandReport>;

/** A report with nothing to count, for a command that stops before its work. */
export const stoppedReport = (exit: ExitCode, headline: string): CommandReport => ({
    exit,
    headline,
    counts: {},
    rates: [],
    spendUsd: null,
    outputs: [],
    next: [],
});

const failedReport = (output: CommandOutput, failure: CommandFailure, exit: ExitCode): CommandReport => {
    output.failure(failure);
    return stoppedReport(exit, failure.what);
};

/** Reads the command's own flags and runs it; an unexpected error becomes a failure, its stack goes to stderr. */
const runToReport = async <Options>(
    definition: CommandDefinition<Options>,
    args: readonly string[],
    output: CommandOutput,
    environment: CommandEnvironment,
    run: CommandRun<Options>,
): Promise<CommandReport> => {
    const read = definition.parseOptions(args);
    if (read.kind === 'invalid') {
        return failedReport(
            output,
            invalidArgumentsFailure(definition, read.reason),
            definition.exitCodes.invalidArguments,
        );
    }
    try {
        return await run(read.options, output);
    } catch (error) {
        environment.stderr.write(`${errorStack(error)}\n`);
        return failedReport(output, unexpectedErrorFailure(definition, error), definition.exitCodes.unexpectedError);
    }
};

/**
 * Runs a command in the output mode its flags, `AGENT_SILENT_FAILURES_OUTPUT` or the terminal ask for: `--help`
 * prints help, an unreadable command line is reported as a failure, and every run ends with one summary carrying the
 * exit code and its meaning. Returns the exit code.
 */
export const runCommand = async <Options>(
    definition: CommandDefinition<Options>,
    argv: readonly string[],
    run: CommandRun<Options>,
    environment: CommandEnvironment = processEnvironment(),
): Promise<number> => {
    const invocation = readInvocation(argv, environment);
    if (invocation.kind === 'readable' && invocation.help) {
        environment.stdout.write(helpText(definition));
        return 0;
    }
    using restorations = new DisposableStack();
    if (invocation.mode.kind === 'json') {
        restorations.use(routeConsoleToStderr());
    }
    const output = createCommandOutput(definition.name, invocation.mode, environment);
    const report =
        invocation.kind === 'readable'
            ? await runToReport(definition, invocation.commandArgs, output, environment, run)
            : failedReport(
                  output,
                  invalidArgumentsFailure(definition, invocation.reason),
                  definition.exitCodes.invalidArguments,
              );
    output.finish(report);
    return report.exit.code;
};
