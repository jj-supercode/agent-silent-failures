/** A question without its closing question mark, trimmed: "Who wrote it?" is "Who wrote it". */
export const withoutQuestionMark = (question: string): string => question.replace(/\?\s*$/, '').trim();
