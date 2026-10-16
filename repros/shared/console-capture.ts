const capturedMethods = ['log', 'info', 'warn', 'error', 'debug'] as const;

export type ConsoleCapture = Disposable & { readonly lines: readonly string[] };

/**
 * Records everything written through `console` until disposed, then restores the original methods. Patching the
 * global console is the only way to observe what Mastra's default logger prints.
 */
export const captureConsole = (): ConsoleCapture => {
    const lines: string[] = [];
    // Property descriptors keep the exact original functions, so disposal restores them unchanged.
    const originals = capturedMethods.map(
        (method) => [method, Object.getOwnPropertyDescriptor(console, method)] as const,
    );
    for (const method of capturedMethods) {
        console[method] = (...values: readonly unknown[]) => {
            lines.push(`${method}: ${values.map((value) => String(value)).join(' ')}`);
        };
    }
    return {
        lines,
        [Symbol.dispose]: () => {
            for (const [method, original] of originals) {
                if (original !== undefined) {
                    Object.defineProperty(console, method, original);
                }
            }
        },
    };
};

/** First line of each captured entry: stack traces would make the report unreadable. */
export const firstLines = (capture: ConsoleCapture): readonly string[] =>
    capture.lines.map((line) => line.split('\n')[0] ?? '');
