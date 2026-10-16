import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { catalogEntries, resultsBlockMarkers, resultsBlockName } from '../../src/catalog/index.ts';
import { collectInputs } from './collect-inputs.ts';
import { generatedBlockMarkers, replaceGeneratedBlocks } from './generated-block.ts';
import { generatedPages } from './pages.ts';
import { readmeAnchors } from './readme-anchors.ts';

const repositoryRoot = new URL('../../', import.meta.url);

const committedInputs = async () => {
    const inputs = await collectInputs();
    if (inputs.kind === 'invalid') {
        throw new Error(`${inputs.path}: ${inputs.reason}`);
    }
    return inputs.value;
};

/** GitHub's heading anchor: lower case, punctuation other than hyphens dropped, spaces as hyphens. */
const headingAnchor = (heading: string): string =>
    `#${heading
        .toLowerCase()
        .replaceAll(/[^\p{L}\p{N} -]/gu, '')
        .replaceAll(' ', '-')}`;

describe('readmeAnchors', () => {
    test('every anchor generated text links to names a README heading', async () => {
        const readme = await readFile(new URL('README.md', repositoryRoot), 'utf8');
        const anchors = new Set(
            Array.from(readme.matchAll(/^#{2,3} (.+)$/gm), ([, heading]) => headingAnchor(heading ?? '')),
        );
        expect(Object.values(readmeAnchors).filter((anchor) => !anchors.has(anchor))).toEqual([]);
    });
});

describe('generatedPages', () => {
    test('the entry page markers are the docs-tables markers of the results block', () => {
        expect(resultsBlockMarkers).toEqual(generatedBlockMarkers(resultsBlockName));
    });

    test('renders the results block of every registered entry page', async () => {
        const pages = generatedPages(await committedInputs());
        const entryPagePaths = catalogEntries.map((entry) => `src/entries/${entry.id}/README.md`);
        const resultsPages = pages.filter((page) => resultsBlockName in page.blocks).map((page) => page.path);

        expect(resultsPages.toSorted()).toEqual(entryPagePaths.toSorted());
    });

    test('a hand-edited rate on an entry page differs from what the generator renders, so --check fails', async () => {
        const pages = generatedPages(await committedInputs());
        const toolLoop = pages.find((page) => page.path === 'src/entries/tool-loop/README.md');
        const committed = await readFile(new URL('src/entries/tool-loop/README.md', repositoryRoot), 'utf8');
        const rendered = replaceGeneratedBlocks(committed, toolLoop?.blocks ?? {});
        const tampered = committed.replace(/caught (\d+)\/(\d+)/, 'caught 1/$2');
        const renderedFromTampered = replaceGeneratedBlocks(tampered, toolLoop?.blocks ?? {});

        expect(tampered).not.toBe(committed);
        expect(renderedFromTampered).toEqual(rendered);
        expect(renderedFromTampered.kind === 'replaced' ? renderedFromTampered.markdown : '').not.toBe(tampered);
    });
});
