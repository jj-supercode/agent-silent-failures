import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Tests are offline by contract: never load .env (it may hold a live API key).
    envDir: false,
    test: {
        include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
        // `*.integration.test.ts` runs the real stack and belongs to vitest.integration.config.ts.
        exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    },
});
