import { execFileSync } from 'node:child_process';
import { copyFile, mkdtempDisposable, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import { docExamples, importedPackages } from './package-install/doc-examples.ts';
import { PackageInstallCheckError } from './package-install/errors.ts';

/**
 * Installs the packed package into a fresh project outside this repo, next to only its peer dependencies at the
 * versions we test, then type-checks (TypeScript 7) the files in `package-smoke/` together with every `ts` block of
 * the README and the entry pages, and runs the smoke files. A broken exports map, a missing file, an undeclared
 * runtime dependency or a docs example that no longer compiles fails here, not on a user's machine.
 */
const repoRoot = join(import.meta.dirname, '..');
const smokeDirectory = join(repoRoot, 'package-smoke');
const typescriptCompiler = join(repoRoot, 'node_modules', '@typescript', 'native', 'bin', 'tsc');

const manifestSchema = z.object({
    name: z.string(),
    peerDependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
});

const run = (command: string, args: readonly string[], cwd: string): void => {
    execFileSync(command, [...args], { cwd, stdio: 'inherit' });
};

const manifest = manifestSchema.parse(JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8')));
const testedVersionOf = (name: string): string => {
    const version = manifest.devDependencies[name];
    if (version === undefined) {
        throw new PackageInstallCheckError(`${name} is imported by the smoke or a docs example but not pinned here`);
    }
    return version;
};

const examples = await docExamples(repoRoot);
const smokeFiles = (await readdir(smokeDirectory)).filter((file) => file.endsWith('.ts'));
/** Peers always; any other package a docs example imports, at the version this repo pins. */
const consumerDependencies = Object.fromEntries(
    [
        ...new Set([
            ...Object.keys(manifest.peerDependencies),
            ...examples.flatMap((example) => importedPackages(example.source)),
        ]),
    ]
        .filter((name) => name !== manifest.name)
        .map((name) => [name, testedVersionOf(name)]),
);

await using consumer = await mkdtempDisposable(join(tmpdir(), 'agent-silent-failures-consumer-'));
run('pnpm', ['pack', '--pack-destination', consumer.path], repoRoot);
const tarball = (await readdir(consumer.path)).find((file) => file.endsWith('.tgz'));
if (tarball === undefined) {
    throw new PackageInstallCheckError('pnpm pack produced no tarball');
}
await writeFile(
    join(consumer.path, 'package.json'),
    JSON.stringify({
        name: 'package-smoke-consumer',
        private: true,
        type: 'module',
        dependencies: { [manifest.name]: `file:./${tarball}`, ...consumerDependencies },
        devDependencies: { '@types/node': testedVersionOf('@types/node') },
    }),
);
await Array.fromAsync(['tsconfig.json', ...smokeFiles], (file) =>
    copyFile(join(smokeDirectory, file), join(consumer.path, file)),
);
await Array.fromAsync(examples, (example) => writeFile(join(consumer.path, example.fileName), example.source));
// The tested versions can be newer than pnpm's minimum release age, and peers must resolve exactly.
run(
    'pnpm',
    ['install', '--ignore-workspace', '--config.minimum-release-age=0', '--config.strict-peer-dependencies=true'],
    consumer.path,
);
run('node', [typescriptCompiler, '-p', consumer.path], consumer.path);
smokeFiles.forEach((file) => run('node', [file], consumer.path));
console.log(`package smoke: ${smokeFiles.length} smoke files ran, ${examples.length} docs examples compiled`);
