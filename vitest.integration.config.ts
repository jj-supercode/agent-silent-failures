import { defineConfig } from 'vitest/config';

export default defineConfig({
    envDir: false,
    test: {
        include: ['src/**/*.integration.test.ts'],
        // One worker: each file loads the ONNX embedding model, and parallel loads compete for memory.
        maxWorkers: 1,
        testTimeout: 300_000,
        hookTimeout: 300_000,
    },
});
