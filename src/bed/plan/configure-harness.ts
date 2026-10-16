import type { RunSetting } from '../../catalog/index.ts';
import {
    defaultHarnessConfig,
    defaultMultiAgentConfig,
    withModel,
    withSettings,
    type AgentPolicy,
    type HarnessConfig,
} from '../../harness/index.ts';
import type { ModelSource } from '../model.ts';
import type { ConditionCase } from './condition-cases.ts';
import type { Family } from './families.ts';
import {
    forRole,
    withAbstentionWording,
    withAnswerWording,
    withDelegationPhrasing,
    withQuestionPhrasing,
    withRefinement,
    type PolicyVariation,
} from './policy-variations.ts';

const baseConfig = (setting: RunSetting): HarnessConfig =>
    setting.harness === 'single-agent' ? defaultHarnessConfig : defaultMultiAgentConfig;

/** Applies variations innermost first: the abstention is swapped before any wording wraps it. */
const varied = (policy: AgentPolicy, variations: readonly PolicyVariation[]): AgentPolicy =>
    variations.reduce((current, vary) => vary(current), policy);

const singleAgentVariations = (family: Family): readonly PolicyVariation[] => [
    ...(family.refines ? [withRefinement] : []),
    withAbstentionWording(family.abstention),
    withAnswerWording(family.wording),
    withQuestionPhrasing(family.phrasing),
];

const multiAgentVariations = (family: Family): readonly PolicyVariation[] => [
    withAbstentionWording(family.abstention),
    forRole('researcher', withAnswerWording(family.wording)),
    forRole('checker', withAnswerWording(family.wording)),
    forRole('supervisor', withAnswerWording(family.supervisorAnswer)),
    forRole('supervisor', withDelegationPhrasing(family.delegation)),
];

const familyVariations = (family: Family, setting: RunSetting): readonly PolicyVariation[] => {
    switch (setting.harness) {
        case 'single-agent':
            return singleAgentVariations(family);
        case 'multi-agent':
            return multiAgentVariations(family);
        default:
            return setting satisfies never;
    }
};

/** Family settings, then the condition, then (scripted models only) the family's policy variations. */
export const configureHarness = (
    family: Family,
    conditionCase: ConditionCase,
): { readonly config: HarnessConfig; readonly modelSource: ModelSource } => {
    const base = baseConfig(conditionCase.setting);
    const withFamily = withSettings(base, {
        retrieval: { ...base.settings.retrieval, topK: family.topK },
        chunking: family.chunking,
    });
    const conditioned = conditionCase.apply(withFamily);
    const modelSource = conditioned.mechanisms.model === withFamily.mechanisms.model ? 'clean-policy' : 'fault-policy';
    const { model } = conditioned.mechanisms;
    const config =
        model.kind === 'scripted'
            ? withModel(conditioned, {
                  kind: 'scripted',
                  policy: varied(model.policy, familyVariations(family, conditionCase.setting)),
              })
            : conditioned;
    return { config, modelSource };
};
