import { secretLookingVariables } from './sensitive-strings.ts';

/** Environment values none of which may appear in a fixture. */
export type EnvironmentValues = ReadonlyMap<string, string>;

/** The secret-looking variables of the recording process's environment. */
export const guardedProcessEnvironment = (): EnvironmentValues =>
    secretLookingVariables(
        new Map(Object.entries(process.env).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]]))),
    );
