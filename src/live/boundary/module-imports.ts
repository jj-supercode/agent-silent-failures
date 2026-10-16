import { readFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

/** One runtime import of a module. Type-only imports are erased before Node runs the file, so they never count. */
export type ModuleImport = {
    readonly specifier: string;
    readonly dynamic: boolean;
};

const isTypeOnlyImport = (node: ts.ImportDeclaration): boolean =>
    node.importClause?.isTypeOnly === true ||
    (node.importClause?.name === undefined &&
        node.importClause?.namedBindings !== undefined &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.length > 0 &&
        node.importClause.namedBindings.elements.every((element) => element.isTypeOnly));

const staticImport = (node: ts.Node): ModuleImport | null => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !isTypeOnlyImport(node)) {
        return { specifier: node.moduleSpecifier.text, dynamic: false };
    }
    if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier)
    ) {
        return { specifier: node.moduleSpecifier.text, dynamic: false };
    }
    return null;
};

const dynamicImport = (node: ts.Node): ModuleImport | null => {
    if (!ts.isCallExpression(node) || node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
        return null;
    }
    const [argument] = node.arguments;
    return argument !== undefined && ts.isStringLiteralLike(argument)
        ? { specifier: argument.text, dynamic: true }
        : { specifier: '<computed>', dynamic: true };
};

/**
 * Every child node, through `forEachChild`: unlike `getChildren`, it never materialises the tokens between them. Its
 * callback stops at the first truthy return, so collecting into a scratch array is its only shape; returning
 * `undefined` visits every child, and the array is frozen before it leaves.
 */
const childrenOf = (node: ts.Node): readonly ts.Node[] => {
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => void children.push(child));
    return Object.freeze(children);
};

const collectImports = (node: ts.Node): readonly ModuleImport[] => [
    ...[staticImport(node), dynamicImport(node)].flatMap((found) => (found === null ? [] : [found])),
    ...childrenOf(node).flatMap(collectImports),
];

/** The runtime imports of a TypeScript or JavaScript module, from its syntax tree (never by text search). */
export const moduleImports = (fileName: string, sourceText: string): readonly ModuleImport[] =>
    collectImports(ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest));

export type ModuleGraph = {
    /** Absolute paths of every local module reached, the entry points included. */
    readonly files: ReadonlySet<string>;
    /** Bare specifiers (packages and `node:` built-ins) imported by any reached module. */
    readonly packages: ReadonlySet<string>;
};

export type GraphOptions = { readonly followDynamicImports: boolean };

const isRelative = (specifier: string): boolean => specifier.startsWith('./') || specifier.startsWith('../');

const localTargets = (file: string, imports: readonly ModuleImport[]): readonly string[] =>
    imports
        .filter((found) => isRelative(found.specifier))
        .map((found) => path.resolve(path.dirname(file), found.specifier));

const packageSpecifiers = (imports: readonly ModuleImport[]): readonly string[] =>
    imports.filter((found) => !isRelative(found.specifier)).map((found) => found.specifier);

const runtimeImportsOf = async (file: string, options: GraphOptions): Promise<readonly ModuleImport[]> =>
    moduleImports(file, await readFile(file, 'utf8')).filter((found) => options.followDynamicImports || !found.dynamic);

/**
 * One layer of the walk: read every not yet visited file of the frontier in parallel, then walk the local modules
 * they import. Layers keep the graph immutable without copying it once per file.
 */
const walk = async (frontier: readonly string[], graph: ModuleGraph, options: GraphOptions): Promise<ModuleGraph> => {
    const unvisited = [...new Set(frontier)].filter((file) => !graph.files.has(file));
    if (unvisited.length === 0) {
        return graph;
    }
    const imports = await Promise.all(unvisited.map((file) => runtimeImportsOf(file, options)));
    return walk(
        unvisited.flatMap((file, index) => localTargets(file, imports[index] ?? [])),
        {
            files: new Set([...graph.files, ...unvisited]),
            packages: new Set([...graph.packages, ...imports.flatMap(packageSpecifiers)]),
        },
        options,
    );
};

/** Walks local imports from the entry files; a computed `import()` is recorded as the package `<computed>`. */
export const reachableModules = (entryFiles: readonly string[], options: GraphOptions): Promise<ModuleGraph> =>
    walk(
        entryFiles.map((file) => path.resolve(file)),
        { files: new Set(), packages: new Set() },
        options,
    );
