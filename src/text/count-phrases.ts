/** "the only retrieval" when there was one, else "2 of 5 retrievals": how a verdict names the calls it judged. */
export const retrievalsAmong = (count: number, total: number): string =>
    total === 1 ? 'the only retrieval' : `${count} of ${total} retrievals`;
