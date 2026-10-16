import path from 'node:path';

/** How a written file is named in output: relative inside the repository, absolute elsewhere. */
export const displayPath = (repositoryRoot: string, target: string): string => {
    const relative = path.relative(repositoryRoot, path.resolve(target));
    return relative.startsWith('..') || path.isAbsolute(relative) ? path.resolve(target) : relative;
};
