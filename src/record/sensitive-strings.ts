export type SensitiveKind = 'api-key' | 'email' | 'home-path' | 'env-value';

/** Where something sensitive-looking was found. Never holds the matched value itself, only a masked hint. */
export type SensitiveFinding = {
    readonly kind: SensitiveKind;
    readonly hint: string;
};

type SensitivePattern = { readonly kind: SensitiveKind; readonly pattern: RegExp };

const sensitivePatterns: readonly SensitivePattern[] = [
    { kind: 'api-key', pattern: /sk-ant-[\w-]+/g },
    { kind: 'api-key', pattern: /\bsk-[\w-]{20,}/g },
    { kind: 'email', pattern: /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi },
    { kind: 'home-path', pattern: /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^/\\\s"]+/g },
];

/** Environment values shorter than this (flags, small numbers, `true`) are too common to mean anything. */
const minimumSecretLength = 8;

const masked = (value: string): string => `${value.slice(0, 4)}… (${value.length} chars)`;

const patternFindings = (text: string): readonly SensitiveFinding[] =>
    sensitivePatterns.flatMap(({ kind, pattern }) =>
        Array.from(text.matchAll(pattern), (match) => ({ kind, hint: masked(match[0]) })),
    );

const environmentFindings = (text: string, environment: ReadonlyMap<string, string>): readonly SensitiveFinding[] =>
    [...environment]
        .filter(([, value]) => value.length >= minimumSecretLength && text.includes(value))
        .map(([name]) => ({ kind: 'env-value', hint: `value of ${name}` }));

const secretNamePattern = /key|token|secret|pass|auth|credential|cookie|session|dsn|database_url/i;

/** A long unbroken run of letters and digits, the shape of generated keys and tokens. */
const opaqueValuePattern = /^(?=.*\d)(?=.*[a-z])[\w+/=.:-]{24,}$/i;

/**
 * The environment variables worth guarding: a secret-sounding name, or a long opaque value. Ordinary settings
 * (`NODE_ENV=production`, `SHELL=/bin/zsh`) are left out, since their values occur in ordinary text.
 */
export const secretLookingVariables = (environment: ReadonlyMap<string, string>): ReadonlyMap<string, string> =>
    new Map(
        [...environment].filter(
            ([name, value]) =>
                value.length >= minimumSecretLength && (secretNamePattern.test(name) || opaqueValuePattern.test(value)),
        ),
    );

/**
 * Scans text bound for a public fixture for API keys, emails, home-directory paths (which carry a user name) and
 * the values of the given environment variables. Reported by kind and environment variable name, never by value.
 */
export const sensitiveFindings = (
    text: string,
    environment: ReadonlyMap<string, string> = new Map(),
): readonly SensitiveFinding[] => [...patternFindings(text), ...environmentFindings(text, environment)];
