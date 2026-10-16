import type { VectorId } from './model.ts';

export class CorruptVectorMetadataError extends Error {
    override readonly name = 'CorruptVectorMetadataError';
    readonly vectorId: VectorId;

    constructor(vectorId: VectorId, issues: string) {
        super(`vector ${vectorId} carries metadata of an unexpected shape: ${issues}`);
        this.vectorId = vectorId;
    }
}
