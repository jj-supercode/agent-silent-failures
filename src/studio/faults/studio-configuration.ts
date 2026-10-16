import type { LanguageModelV4 } from '@ai-sdk/provider';

import { documentLayoutOf, type DocumentLayout, type RunSetting } from '../../catalog/index.ts';
import {
    createMultiAgentPolicy,
    defaultMultiAgentConfig,
    withModel,
    type AgentPolicy,
    type HarnessConfig,
} from '../../harness/index.ts';
import { scriptedThreadModel } from '../scripted-thread-model.ts';
import type { StudioFaultPreset, StudioMode } from './model.ts';

/** The agents' model in Studio: the scripted policies of the configuration, or one provided model for every agent. */
export type StudioAgentModel =
    { readonly kind: 'scripted' } | { readonly kind: 'live'; readonly model: LanguageModelV4 };

export const studioModeOf = (model: StudioAgentModel): StudioMode => model.kind;

/** The clean Studio configuration: the supervisor, its workers and the RAG agent, each on its clean scripted policy. */
const cleanStudioConfig = defaultMultiAgentConfig;

/**
 * A single-agent fault's policy drives the agents that search the corpus (the RAG agent and the researcher); the
 * supervisor and the checker stay clean. A multi-agent fault's policy already routes every role.
 */
const routedPolicy = (policy: AgentPolicy, setting: RunSetting): AgentPolicy =>
    setting.harness === 'single-agent' ? createMultiAgentPolicy({ researcher: policy }) : policy;

/** The fault case's own scripted policy when it replaces the clean one, else `null`. */
const faultPolicyOf = (faulted: HarnessConfig): AgentPolicy | null => {
    const { model } = faulted.mechanisms;
    return model.kind === 'scripted' && model !== cleanStudioConfig.mechanisms.model ? model.policy : null;
};

/** The policy every agent runs in scripted mode: the fault case's own when it scripts the model, else the clean one. */
const scriptedPolicyOf = (faulted: HarnessConfig, setting: RunSetting): AgentPolicy => {
    const faultPolicy = faultPolicyOf(faulted);
    return faultPolicy === null ? createMultiAgentPolicy() : routedPolicy(faultPolicy, setting);
};

/** Whether the preset's scripted mode replaces the clean policy with its fault's own (a misbehaving model on cue). */
export const presetScriptsTheModel = (preset: StudioFaultPreset): boolean =>
    faultPolicyOf(preset.faultCase.apply(cleanStudioConfig)) !== null;

const faultedConfig = (preset: StudioFaultPreset | null): HarnessConfig => {
    if (preset === null) {
        return cleanStudioConfig;
    }
    const withCase = preset.faultCase.apply(cleanStudioConfig);
    return preset.trigger === null ? withCase : preset.trigger(withCase);
};

export type StudioConfiguration = { readonly config: HarnessConfig; readonly documents: DocumentLayout };

/**
 * The harness configuration of a Studio session. Scripted: the preset's fault case applies whole, scripted policy
 * included, plus its trigger. Live: the same infrastructure and trigger, with the provided model in place of any
 * scripted policy, so what the model then does is its own behaviour.
 */
export const studioConfiguration = (preset: StudioFaultPreset | null, model: StudioAgentModel): StudioConfiguration => {
    const faulted = faultedConfig(preset);
    const setting: RunSetting = preset?.faultCase.setting ?? { harness: 'multi-agent' };
    const agentModel =
        model.kind === 'scripted' ? scriptedThreadModel(scriptedPolicyOf(faulted, setting)) : model.model;
    return {
        config: withModel(faulted, { kind: 'provided', model: agentModel }),
        documents: documentLayoutOf(setting),
    };
};
