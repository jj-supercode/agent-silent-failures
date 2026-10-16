/** How a failure reads in a fixture's failed line and in a session's stop reason: `Name: message`. */
export const errorText = (error: unknown): string =>
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
