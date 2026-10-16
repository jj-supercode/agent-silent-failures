import { APICallError } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';

import { RunCallLimitError } from '../budget/errors.ts';
import { budgetKeySchema } from '../budget/model.ts';
import { badRequestError, offlineError, overloadedError } from '../testing.ts';
import { TransientProviderError } from './errors.ts';
import { classifyProviderFailure } from './provider-failure.ts';

const callError = (statusCode: number, headers: Record<string, string> = {}) =>
    new APICallError({
        message: `status ${statusCode}`,
        url: 'https://api.anthropic.com/v1/messages',
        requestBodyValues: {},
        statusCode,
        responseHeaders: headers,
    });

const retryAfterSeconds = 7;

describe('classifyProviderFailure', () => {
    test.each([408, 429, 500, 502, 503, 504, 529])('treats HTTP %i as transient', (status) => {
        expect(classifyProviderFailure(callError(status)).kind).toBe('transient');
    });

    test.each([400, 401, 402, 403, 404, 409, 413, 422])('treats HTTP %i as a permanent request error', (status) => {
        expect(classifyProviderFailure(callError(status)).kind).toBe('permanent');
    });

    test('treats an overloaded provider as transient and names the status', () => {
        expect(classifyProviderFailure(overloadedError())).toEqual({
            kind: 'transient',
            reason: 'HTTP 529: Overloaded',
            retryAfter: null,
        });
    });

    test('reads the wait a rate limit asks for from retry-after', () => {
        expect(classifyProviderFailure(callError(429, { 'retry-after': String(retryAfterSeconds) }))).toMatchObject({
            kind: 'transient',
            retryAfter: retryAfterSeconds * 1_000,
        });
    });

    test('treats an unreachable provider (no status, retryable) as transient', () => {
        expect(classifyProviderFailure(offlineError()).kind).toBe('transient');
    });

    test('treats a raw socket error found down the cause chain as transient', () => {
        const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
        expect(classifyProviderFailure(new TypeError('fetch failed', { cause: reset })).kind).toBe('transient');
    });

    test('treats a request timeout as transient', () => {
        expect(classifyProviderFailure(new DOMException('timed out', 'TimeoutError')).kind).toBe('transient');
    });

    test('treats a mid-stream overloaded event as transient and any other stream error as permanent', () => {
        expect(classifyProviderFailure({ type: 'overloaded_error', message: 'Overloaded' }).kind).toBe('transient');
        expect(classifyProviderFailure({ type: 'invalid_request_error', message: 'bad' }).kind).toBe('permanent');
    });

    test('keeps a request error and a guard refusal permanent: they would fail the same way again', () => {
        expect(classifyProviderFailure(badRequestError()).kind).toBe('permanent');
        expect(classifyProviderFailure(new RunCallLimitError(budgetKeySchema.parse('run'), 12))).toEqual({
            kind: 'permanent',
            reason: 'RunCallLimitError: run run reached its limit of 12 model calls',
        });
    });

    test('keeps an unknown error permanent, so it is never paid for twice', () => {
        expect(classifyProviderFailure(new Error('something else')).kind).toBe('permanent');
        expect(classifyProviderFailure('a string').kind).toBe('permanent');
    });

    test('reads an already classified failure back unchanged', () => {
        const failure = { kind: 'transient', reason: 'HTTP 529: Overloaded', retryAfter: null } as const;
        expect(classifyProviderFailure(new TransientProviderError(failure, overloadedError()))).toBe(failure);
    });

    test('survives a cause chain that loops', () => {
        const looping = new Error('loop');
        looping.cause = looping;
        expect(classifyProviderFailure(looping).kind).toBe('permanent');
    });
});
