import type { HarnessConfig } from './config.ts';

/** One reproducible severity of a fault: a harness configuration change, never a trace edit. */
export type FaultVariant = {
    readonly severity: string;
    readonly apply: (config: HarnessConfig) => HarnessConfig;
};

export type Fault = {
    readonly id: string;
    readonly description: string;
    readonly variants: readonly [FaultVariant, ...FaultVariant[]];
};

export type FaultDefinition<TSeverity extends string> = {
    readonly id: string;
    readonly description: string;
    readonly severities: readonly [TSeverity, ...TSeverity[]];
    readonly apply: (config: HarnessConfig, severity: TSeverity) => HarnessConfig;
};

export const defineFault = <TSeverity extends string>(definition: FaultDefinition<TSeverity>): Fault => {
    const toVariant = (severity: TSeverity): FaultVariant => ({
        severity,
        apply: (config) => definition.apply(config, severity),
    });
    const [first, ...rest] = definition.severities;
    return {
        id: definition.id,
        description: definition.description,
        variants: [toVariant(first), ...rest.map(toVariant)],
    };
};
