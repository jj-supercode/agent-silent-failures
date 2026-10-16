export class DryRunOutsideRunError extends Error {
    override readonly name = 'DryRunOutsideRunError';

    constructor() {
        super('the dry-run model was called outside a run scope, so it cannot tell which scripted run to replay');
    }
}

/** A dry run replays a configuration's scripted policy; a configuration with a provided model has none. */
export class NotScriptedConfigError extends Error {
    override readonly name = 'NotScriptedConfigError';

    constructor() {
        super('a dry run needs a harness configuration whose model is a scripted policy');
    }
}
