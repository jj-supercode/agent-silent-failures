import { z } from 'zod';

/** One row of the Hugging Face `hotpotqa/hotpot_qa` distractor parquet (columnar lists, snake_case). */
export const hotpotSourceRowSchema = z
    .object({
        id: z.string().min(1),
        question: z.string().min(1),
        answer: z.string().min(1),
        type: z.enum(['bridge', 'comparison']),
        level: z.enum(['easy', 'medium', 'hard']),
        supporting_facts: z.object({
            title: z.array(z.string().min(1)),
            sent_id: z.array(z.int().nonnegative()),
        }),
        context: z.object({
            title: z.array(z.string().min(1)),
            sentences: z.array(z.array(z.string()).min(1)),
        }),
    })
    .refine((row) => row.supporting_facts.title.length === row.supporting_facts.sent_id.length, {
        message: 'supporting_facts.title and supporting_facts.sent_id differ in length',
    })
    .refine((row) => row.context.title.length === row.context.sentences.length, {
        message: 'context.title and context.sentences differ in length',
    });
export type HotpotSourceRow = z.infer<typeof hotpotSourceRowSchema>;
