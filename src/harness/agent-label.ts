/** A Studio-only note on how agents present themselves, e.g. the fault the session runs under. Display text only. */
export type AgentLabel = string;

export type AgentPresentation = { readonly name: string; readonly description: string };

const labelledDescription = (description: string, label: AgentLabel): string => `[${label}] ${description}`;

/**
 * The label on both the display name and the description. Only for agents nobody delegates to: Mastra records the
 * name as the span's `entityName`, which no view or detector reads, while a delegated worker's name is never touched.
 */
export const agentLabelled = (presentation: AgentPresentation, label: AgentLabel | undefined): AgentPresentation =>
    label === undefined
        ? presentation
        : {
              name: `${presentation.name} [${label}]`,
              description: labelledDescription(presentation.description, label),
          };

/** The label on the description only: for workers, whose names stay exactly as their supervisor knows them. */
export const workerLabelled = (presentation: AgentPresentation, label: AgentLabel | undefined): AgentPresentation =>
    label === undefined
        ? presentation
        : { ...presentation, description: labelledDescription(presentation.description, label) };
