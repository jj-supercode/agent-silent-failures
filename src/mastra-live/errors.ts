export class StudioLiveRefusedError extends Error {
    override readonly name = 'StudioLiveRefusedError';

    constructor(reason: string) {
        super(`pnpm studio:live refused to start: ${reason}. Nothing was sent.`);
    }
}
