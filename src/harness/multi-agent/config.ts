import { defaultHarnessConfig, withModel, type HarnessConfig } from '../config.ts';
import { createMultiAgentPolicy } from './policy/multi-agent-policy.ts';

/** The clean multi-agent configuration: the default harness with every role on its clean scripted policy. */
export const defaultMultiAgentConfig: HarnessConfig = withModel(defaultHarnessConfig, {
    kind: 'scripted',
    policy: createMultiAgentPolicy(),
});
