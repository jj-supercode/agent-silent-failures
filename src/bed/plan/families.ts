import { abstentionAnswer, chunkingSettingsSchema, type ChunkingSettings } from '../../harness/index.ts';
import { withoutQuestionMark } from '../../text/questions.ts';
import { stopwords } from '../../text/stopwords.ts';
import { familyIdSchema, type FamilyId, type Split } from '../model.ts';
import type { AbstentionWording, AnswerWording, DelegationPhrasing, QuestionPhrasing } from './policy-variations.ts';

/**
 * One variation family. Retrieval settings, answer wording and the abstention sentence apply to both harnesses.
 * Question phrasing and refinement are single-agent only, because the multi-agent supervisor parses its task message;
 * there the family varies what the supervisor sends and writes instead: the phrasing of its research requests and the
 * wording of its final answer, while `wording` rewords every worker reply.
 */
export type Family = {
    readonly id: FamilyId;
    readonly topK: number;
    readonly chunking: ChunkingSettings;
    readonly phrasing: QuestionPhrasing;
    readonly wording: AnswerWording;
    readonly abstention: AbstentionWording;
    readonly refines: boolean;
    readonly delegation: DelegationPhrasing;
    readonly supervisorAnswer: AnswerWording;
};

const chunking = (maxSize: number, overlap: number): ChunkingSettings =>
    chunkingSettingsSchema.parse({ strategy: 'recursive', maxSize, overlap });

const keywordsOnly = (question: string): string =>
    withoutQuestionMark(question)
        .split(/\s+/)
        .filter((word) => !stopwords.has(word.toLowerCase()))
        .join(' ');

const phrasings = {
    t1: { name: 'T1 as asked', rephrase: (question) => question },
    t2: { name: 'T2 find passages', rephrase: (question) => `Find passages about: ${question}` },
    t3: { name: 'T3 lower case', rephrase: (question) => question.toLowerCase() },
    t4: { name: 'T4 which passage', rephrase: (question) => `Which passage answers this question? ${question}` },
    t5: { name: 'T5 cite sources', rephrase: (question) => `${question} Please cite your sources.` },
    t6: { name: 'T6 keywords only', rephrase: keywordsOnly },
} as const satisfies Record<string, QuestionPhrasing>;

const wordings = {
    a1: { name: 'A1 as composed', reword: (answer) => answer },
    a2: { name: 'A2 answer prefix', reword: (answer) => `Answer: ${answer}` },
    a3: { name: 'A3 provenance suffix', reword: (answer) => `${answer} (from the retrieved passages)` },
    a4: { name: 'A4 corpus preface', reword: (answer) => `Here is what the corpus says. ${answer}` },
} as const satisfies Record<string, AnswerWording>;

/** Abstentions as models phrase them; dev and held-out share none, so abstention matching is measured on new text. */
const abstentions = {
    n1: { name: 'N1 as instructed', sentence: abstentionAnswer },
    n2: { name: 'N2 passages lack it', sentence: 'The retrieved passages do not contain the answer.' },
    n3: { name: 'N3 contraction', sentence: "I couldn't find anything about this in the documents." },
    n4: {
        name: 'N4 was not able to',
        sentence: "I wasn't able to find any information about this in the documents.",
    },
    n5: { name: 'N5 no information', sentence: "I don't have any information about that in the knowledge base." },
    n6: {
        name: 'N6 nothing relevant',
        sentence: 'The search returned nothing relevant, so I cannot answer this reliably.',
    },
} as const satisfies Record<string, AbstentionWording>;

/** Appends `suffix` once, so a re-sent request that already carries it is not extended again. */
const withSuffix =
    (suffix: string) =>
    (prompt: string): string =>
        prompt.endsWith(suffix) ? prompt : `${prompt} ${suffix}`;

const delegations = {
    p1: { name: 'P1 as composed', rephrase: (prompt) => prompt },
    p2: { name: 'P2 two sentences', rephrase: withSuffix('Reply in two sentences.') },
    p3: { name: 'P3 corpus facts only', rephrase: withSuffix('Only use facts from the corpus.') },
    p4: { name: 'P4 for the final answer', rephrase: withSuffix('This feeds the final answer, so be precise.') },
} as const satisfies Record<string, DelegationPhrasing>;

const supervisorAnswers = {
    s1: { name: 'S1 as synthesised', reword: (answer) => answer },
    s2: { name: 'S2 summary prefix', reword: (answer) => `Summary: ${answer}` },
    s3: { name: 'S3 team preface', reword: (answer) => `Based on what the team found: ${answer}` },
    s4: { name: 'S4 closing note', reword: (answer) => `${answer} That is everything the workers reported.` },
} as const satisfies Record<string, AnswerWording>;

const family = ({ id, ...variation }: Omit<Family, 'id'> & { readonly id: string }): Family => ({
    id: familyIdSchema.parse(id),
    ...variation,
});

/**
 * Held-out families differ by mechanism, not only by seed: other top K values (3, 8), other chunk sizes (600 and
 * 1,500 characters, all under the 512-token window on paragraphs), and phrasings, wordings, abstentions, delegation
 * phrasings and supervisor answers that no dev family uses.
 */
export const familiesBySplit = {
    dev: [
        family({
            id: 'd1',
            topK: 5,
            chunking: chunking(1000, 100),
            phrasing: phrasings.t1,
            wording: wordings.a1,
            refines: false,
            abstention: abstentions.n1,
            delegation: delegations.p1,
            supervisorAnswer: supervisorAnswers.s1,
        }),
        family({
            id: 'd2',
            topK: 5,
            chunking: chunking(1000, 100),
            phrasing: phrasings.t2,
            wording: wordings.a2,
            refines: true,
            abstention: abstentions.n2,
            delegation: delegations.p2,
            supervisorAnswer: supervisorAnswers.s2,
        }),
        family({
            id: 'd3',
            topK: 5,
            chunking: chunking(800, 80),
            phrasing: phrasings.t3,
            wording: wordings.a1,
            refines: false,
            abstention: abstentions.n3,
            delegation: delegations.p1,
            supervisorAnswer: supervisorAnswers.s2,
        }),
    ],
    'held-out': [
        family({
            id: 'h1',
            topK: 3,
            chunking: chunking(600, 60),
            phrasing: phrasings.t4,
            wording: wordings.a3,
            refines: false,
            abstention: abstentions.n4,
            delegation: delegations.p3,
            supervisorAnswer: supervisorAnswers.s3,
        }),
        family({
            id: 'h2',
            topK: 8,
            chunking: chunking(1000, 100),
            phrasing: phrasings.t5,
            wording: wordings.a4,
            refines: true,
            abstention: abstentions.n5,
            delegation: delegations.p4,
            supervisorAnswer: supervisorAnswers.s4,
        }),
        family({
            id: 'h3',
            topK: 5,
            chunking: chunking(1500, 150),
            phrasing: phrasings.t6,
            wording: wordings.a3,
            refines: false,
            abstention: abstentions.n6,
            delegation: delegations.p3,
            supervisorAnswer: supervisorAnswers.s4,
        }),
    ],
} as const satisfies Record<Split, readonly [Family, ...Family[]]>;
