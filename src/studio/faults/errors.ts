export class UnknownFaultCaseError extends Error {
    override readonly name = 'UnknownFaultCaseError';

    constructor(faultId: string, severity: string) {
        super(`no catalog fault case ${faultId}/${severity}: a Studio preset names a fault the catalog does not hold`);
    }
}
