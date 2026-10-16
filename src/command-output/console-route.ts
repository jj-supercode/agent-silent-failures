/**
 * Sends `console.log`, `console.info` and `console.debug` to stderr until disposed. In `--json` mode stdout carries
 * events only, so a library that logs to stdout cannot break a consumer's line-by-line parse.
 */
export const routeConsoleToStderr = (): Disposable => {
    const { log, info, debug } = console;
    console.log = console.error;
    console.info = console.error;
    console.debug = console.error;
    return {
        [Symbol.dispose]: () => {
            console.log = log;
            console.info = info;
            console.debug = debug;
        },
    };
};
