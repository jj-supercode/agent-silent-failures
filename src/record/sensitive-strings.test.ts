import { describe, expect, test } from 'vitest';

import { secretLookingVariables, sensitiveFindings } from './sensitive-strings.ts';

/** Built at run time so this file never contains a key-shaped literal itself. */
const fakeAnthropicKey = ['sk', 'ant', 'api03', 'x'.repeat(24)].join('-');

describe('sensitiveFindings', () => {
    test('finds an Anthropic key and reports it masked', () => {
        const findings = sensitiveFindings(`{"header":"${fakeAnthropicKey}"}`);
        expect(findings.map((finding) => finding.kind)).toContain('api-key');
        expect(JSON.stringify(findings)).not.toContain(fakeAnthropicKey);
    });

    test('finds an email address', () => {
        expect(sensitiveFindings('contact someone.else@example.org today')).toEqual([
            { kind: 'email', hint: 'some… (24 chars)' },
        ]);
    });

    test('finds a home-directory path, which carries a user name', () => {
        expect(sensitiveFindings('at /Users/someone/project/src/file.ts:12').map((finding) => finding.kind)).toEqual([
            'home-path',
        ]);
        expect(sensitiveFindings('at /home/someone/app').map((finding) => finding.kind)).toEqual(['home-path']);
    });

    test('finds an environment value and names the variable, not the value', () => {
        const environment = new Map([['DATABASE_URL', 'libsql://private-host:8080']]);
        expect(sensitiveFindings('connected to libsql://private-host:8080', environment)).toEqual([
            { kind: 'env-value', hint: 'value of DATABASE_URL' },
        ]);
    });

    test('ignores short environment values that appear in ordinary text', () => {
        expect(sensitiveFindings('the answer is true', new Map([['CI', 'true']]))).toEqual([]);
    });

    test('passes ordinary corpus text and citations', () => {
        expect(
            sensitiveFindings('John Snow (15 March 1813 - 16 June 1858) was an English physician [S1]. Score 0.82.'),
        ).toEqual([]);
    });
});

describe('secretLookingVariables', () => {
    test('keeps variables with secret-sounding names or opaque values, drops ordinary settings', () => {
        const environment = new Map([
            ['ANTHROPIC_API_KEY', 'not-a-real-value-123'],
            ['SESSION_SECRET', 'correct horse battery'],
            ['BUILD_ID', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4'],
            ['NODE_ENV', 'production'],
            ['SHELL', '/bin/zsh'],
            ['GITHUB_TOKEN', 'short'],
        ]);
        expect([...secretLookingVariables(environment).keys()]).toEqual([
            'ANTHROPIC_API_KEY',
            'SESSION_SECRET',
            'BUILD_ID',
        ]);
    });
});
