// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const detectorImportWall = {
    patterns: [
        {
            regex: '^(?!\\.\\./\\.\\./trace/model\\.ts$|\\.\\./\\.\\./text/[a-z-]+\\.ts$|\\./model\\.ts$)',
            message: 'A detector may import only src/trace/model.ts, src/text/*.ts and its own model.ts.',
        },
    ],
};

const classesOnlyForErrors = {
    selector: 'ClassDeclaration:not([superClass.name="Error"])',
    message: 'Classes are reserved for Error subclasses.',
};

const namedErrorsOnly = {
    selector: 'ThrowStatement > NewExpression[callee.name="Error"]',
    message: 'Throw a named Error subclass from the module errors.ts, not a plain Error.',
};

const harnessBoundary = {
    patterns: [
        {
            regex: '/(harness|corpus|catalog|bed|demo|live|mastra|mastra-live|record|replay|studio)/',
            message: 'Published entry code may not import the offline harness; only fault*.ts and tests may.',
        },
    ],
};

export default defineConfig(
    // repros/*/fixtures/ hold upstream example code that must fail to compile; the repro asserts that.
    // package-smoke/ imports the built dist/, so `pnpm check:package` type-checks it after the build instead.
    // .mastra/ is the Studio dev bundle `mastra dev` writes.
    { ignores: ['node_modules/', 'coverage/', 'dist/', '.mastra/', 'package-smoke/', 'repros/*/fixtures/'] },
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
            '@typescript-eslint/consistent-type-imports': 'error',
            'no-restricted-syntax': ['error', classesOnlyForErrors],
        },
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        files: ['src/**/*.ts', 'scripts/check-package-install.ts'],
        ignores: ['src/**/*.test.ts', 'src/**/testing.ts'],
        rules: { 'no-restricted-syntax': ['error', classesOnlyForErrors, namedErrorsOnly] },
    },
    {
        // The published package is src/entries, src/ingestion, src/trace and src/text; only an entry's fault files
        // reproduce it in the harness.
        files: ['src/entries/**/*.ts', 'src/ingestion/**/*.ts', 'src/trace/**/*.ts', 'src/text/**/*.ts'],
        ignores: ['src/entries/*/fault*.ts', 'src/**/*.test.ts', 'src/trace/testing.ts'],
        rules: { 'no-restricted-imports': ['error', harnessBoundary] },
    },
    {
        // The lexical half of the wall; src/entries/detector-wall.test.ts checks the transitive runtime graph.
        files: ['src/entries/*/detector.ts'],
        rules: {
            'no-restricted-imports': ['error', detectorImportWall],
            'no-restricted-syntax': [
                'error',
                classesOnlyForErrors,
                namedErrorsOnly,
                { selector: 'ImportExpression', message: 'A detector may not import modules at run time.' },
            ],
        },
    },
    {
        files: ['src/entries/*/model.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                { patterns: [{ regex: '^\\./fault', message: 'An entry model may not expose its faults.' }] },
            ],
        },
    },
    prettier,
);
