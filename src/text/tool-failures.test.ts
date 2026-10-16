import { describe, expect, test } from 'vitest';

import { callFailed, isErrorResult } from './tool-failures.ts';

describe('isErrorResult', () => {
    test.each([
        ['MCP isError', { isError: true, content: [] }],
        ['an error message', { error: 'upstream 503: search backend unavailable' }],
        ['an error object with a message', { error: { message: 'timeout' } }],
        ['Mastra output-schema failure', { error: true, message: 'Tool output validation failed' }],
        ['success false with a message', { success: false, message: 'quota exceeded' }],
    ])('recognises %s', (_, value) => {
        expect(isErrorResult(value)).toBe(true);
    });

    test.each([
        ['rows', { hits: [] }],
        ['a business refusal', { success: false, reason: 'already booked' }],
        ['an error code without a message', { error: { code: 0 } }],
        ['error false', { error: false }],
        ['a string', 'error'],
    ])('does not call %s an error', (_, value) => {
        expect(isErrorResult(value)).toBe(false);
    });
});

describe('callFailed', () => {
    test('a thrown call failed', () => {
        expect(callFailed({ outcome: { kind: 'threw', message: 'fetch failed' } })).toBe(true);
    });

    test('a call that returned rows did not', () => {
        expect(callFailed({ outcome: { kind: 'returned', value: { hits: [] } } })).toBe(false);
    });
});
