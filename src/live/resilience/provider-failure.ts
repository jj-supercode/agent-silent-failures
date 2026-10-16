import { APICallError } from '@ai-sdk/provider';
import { z } from 'zod';

import { errorText } from '../error-text.ts';
import { TransientProviderError } from './errors.ts';
import { millisecondsSchema, type Milliseconds, type PermanentFailure, type ProviderFailure } from './model.ts';

/**
 * Statuses the Claude API documents as worth retrying (https://platform.claude.com/docs/en/api/errors, read
 * 2026-10-15): 429 `rate_limit_error`, 500 `api_error`, 504 `timeout_error`, 529 `overloaded_error`; plus the
 * gateway statuses 408, 502 and 503 a proxy in between may answer with. Every other 4xx is a request error.
 */
const transientStatusCodes: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504, 529]);

/** The error types of those statuses, as a mid-stream SSE `error` event names them. */
const transientErrorTypes: ReadonlySet<string> = new Set([
    'rate_limit_error',
    'api_error',
    'timeout_error',
    'overloaded_error',
]);

/**
 * Socket and DNS failures of a lost network. The first group is the AI SDK's own retryable list
 * (`@ai-sdk/provider-utils` 5.0.59, `RETRYABLE_NETWORK_ERROR_CODES`); the DNS and route codes are what a machine
 * that is offline reports instead.
 */
const networkErrorCodes: ReadonlySet<string> = new Set([
    'ConnectionRefused',
    'ConnectionClosed',
    'FailedToOpenSocket',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE',
    'UND_ERR_SOCKET',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_CONNECT_TIMEOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETDOWN',
    'ENETUNREACH',
    'EHOSTUNREACH',
]);

/** A mid-stream provider error: a plain object, not an `Error` (`createProviderStreamError` in the AI SDK). */
const streamErrorSchema = z.object({
    type: z.string().optional(),
    statusCode: z.number().optional(),
    message: z.string().optional(),
});

const errorCodeSchema = z.object({ code: z.string() });

const retryAfterSecondsSchema = z.coerce.number().nonnegative();

/** Bounds the walk down `cause`: chains are short, and a cycle must not hang classification. */
const maxCauseDepth = 8;

const transient = (reason: string, retryAfter: Milliseconds | null = null): ProviderFailure => ({
    kind: 'transient',
    reason,
    retryAfter,
});

const permanent = (reason: string): PermanentFailure => ({ kind: 'permanent', reason });

const causeChain = (error: unknown, depth = 0): readonly unknown[] =>
    error instanceof Error && depth < maxCauseDepth ? [error, ...causeChain(error.cause, depth + 1)] : [error];

const networkCodeOf = (error: unknown): string | null =>
    causeChain(error)
        .map((link) => errorCodeSchema.safeParse(link))
        .flatMap((parsed) => (parsed.success && networkErrorCodes.has(parsed.data.code) ? [parsed.data.code] : []))
        .at(0) ?? null;

/** `retry-after` in seconds; the HTTP-date form is ignored and the backoff applies instead. */
const retryAfterOf = (error: APICallError): Milliseconds | null => {
    const seconds = retryAfterSecondsSchema.safeParse(error.responseHeaders?.['retry-after']);
    return seconds.success ? millisecondsSchema.parse(seconds.data * 1_000) : null;
};

const classifyApiCallError = (error: APICallError): ProviderFailure => {
    if (error.statusCode === undefined) {
        return error.isRetryable
            ? transient(`could not reach the provider: ${error.message}`)
            : permanent(`provider call failed: ${error.message}`);
    }
    const reason = `HTTP ${error.statusCode}: ${error.message}`;
    return transientStatusCodes.has(error.statusCode) ? transient(reason, retryAfterOf(error)) : permanent(reason);
};

const classifyStreamError = (error: unknown): ProviderFailure | null => {
    const parsed = streamErrorSchema.safeParse(error);
    if (!parsed.success || error instanceof Error) {
        return null;
    }
    const { type, statusCode, message } = parsed.data;
    const isTransient =
        (statusCode !== undefined && transientStatusCodes.has(statusCode)) ||
        (type !== undefined && transientErrorTypes.has(type));
    const reason = `provider stream error ${type ?? statusCode ?? 'without a type'}: ${message ?? 'no message'}`;
    return isTransient ? transient(reason) : permanent(reason);
};

/**
 * Sorts a failed model call into transient (send it again later) or permanent (sending it again cannot help). Only a
 * documented retryable status, an overload or a lost network is transient; anything unknown is permanent, so an
 * unexpected error is never paid for twice.
 */
export const classifyProviderFailure = (error: unknown): ProviderFailure => {
    if (error instanceof TransientProviderError) {
        return error.failure;
    }
    if (APICallError.isInstance(error)) {
        return classifyApiCallError(error);
    }
    const networkCode = networkCodeOf(error);
    if (networkCode !== null) {
        return transient(`network error ${networkCode}: ${errorText(error)}`);
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
        return transient(`request timed out: ${error.message}`);
    }
    return classifyStreamError(error) ?? permanent(errorText(error));
};
