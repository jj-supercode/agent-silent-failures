import type { EntryId } from '../entries/index.ts';
import type { Fault } from '../harness/index.ts';
import { faultIdSchema, severityIdSchema, type FaultCase, type FaultExpression, type RunSetting } from './model.ts';

/** Every severity of `fault`, reproduced for `entryId` on `setting`, with how its effect is observed. */
export const faultCases = (
    entryId: EntryId,
    fault: Fault,
    setting: RunSetting,
    expression: FaultExpression,
): readonly [FaultCase, ...FaultCase[]] => {
    const toCase = (variant: Fault['variants'][number]): FaultCase => ({
        entryId,
        faultId: faultIdSchema.parse(fault.id),
        severity: severityIdSchema.parse(variant.severity),
        setting,
        expression,
        apply: variant.apply,
    });
    const [first, ...rest] = fault.variants;
    return [toCase(first), ...rest.map(toCase)];
};

/** Concatenates case lists while keeping the non-empty guarantee. */
export const allCases = (
    first: readonly [FaultCase, ...FaultCase[]],
    ...rest: readonly (readonly FaultCase[])[]
): readonly [FaultCase, ...FaultCase[]] => {
    const [head, ...tail] = first;
    return [head, ...tail, ...rest.flat()];
};
