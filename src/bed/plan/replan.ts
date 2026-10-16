import { withSettings, type HarnessSettings } from '../../harness/index.ts';
import type { HarnessPlan, RunSpec } from '../model.ts';

/** Rewrites every harness plan once, so specs that shared a harness still share the rewritten one. */
export const replan = (
    specs: readonly RunSpec[],
    rewrite: (plan: HarnessPlan, spec: RunSpec) => HarnessPlan,
): readonly RunSpec[] => {
    const plans = new Map(specs.map((spec) => [spec.plan.key, rewrite(spec.plan, spec)]));
    return specs.map((spec) => ({ ...spec, plan: plans.get(spec.plan.key) ?? spec.plan }));
};

/** The same specs with `settings` laid over every harness config, e.g. a smaller embedding batch. */
export const withPlanSettings = (specs: readonly RunSpec[], settings: Partial<HarnessSettings>): readonly RunSpec[] =>
    Object.keys(settings).length === 0
        ? specs
        : replan(specs, (plan) => ({ ...plan, config: withSettings(plan.config, settings) }));
