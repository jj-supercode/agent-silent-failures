export class MissingApiKeyError extends Error {
    override readonly name = 'MissingApiKeyError';

    constructor(envFilePath: string) {
        super(`${envFilePath} has no ANTHROPIC_API_KEY; copy .env.example to .env and set it (live mode only)`);
    }
}
