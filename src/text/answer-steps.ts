import { sentences } from './sentences.ts';

/**
 * Where one step's text ends and the next begins in an agent's output. A multi-step run's output joins each step's
 * text with no separator, so a step that ends "I'll retry." followed by one that starts "Yes, ..." reads
 * "I'll retry.Yes, ...". A sentence end (optionally closed by a bracket or quote) directly followed by a capitalised
 * word, optionally in bold or italics, or by the pronoun "I", marks the join. Abbreviations such as "U.S." are
 * followed by a capital and a full stop, never by a lower-case letter, and never match.
 */
const stepJoin = /(?<=[.!?][)"”’]*)(?=(?:\*\*|\*|_)?(?:\p{Lu}\p{Ll}|I[\s'’]))/u;

/** The text of each step of an agent's output, in order. */
export const answerSteps = (output: string): readonly string[] => output.split(stepJoin);

/** The text of the agent's last step: what it said after its last tool call. */
export const lastStepText = (output: string): string => answerSteps(output).at(-1) ?? output;

/** The sentences of an agent's output: its steps, each split into sentences, so a step join is a boundary too. */
export const answerSentences = (output: string): readonly string[] => answerSteps(output).flatMap(sentences);
