// Human-readable numbers. JSON events carry the exact values; these round for a reader.

const groupedInteger = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `2776` -> `2,776`. */
export const countText = (count: number): string => groupedInteger.format(count);

/** `1 run`, `2,776 runs`; `plural` for nouns that do not take an s. */
export const countedText = (count: number, singular: string, plural = `${singular}s`): string =>
    `${countText(count)} ${count === 1 ? singular : plural}`;

const millisecondsPerSecond = 1_000;
const secondsPerMinute = 60;
const secondsPerHour = 3_600;
/** Below this a duration keeps one decimal: "3.4 s" says more than "3 s". */
const fractionalSecondsBelow = 10;

/** `3.4 s`, `12 s`, `4m 05s`, `1h 12m`. */
export const durationText = (milliseconds: number): string => {
    const seconds = Math.max(0, milliseconds) / millisecondsPerSecond;
    if (seconds < fractionalSecondsBelow) {
        return `${seconds.toFixed(1)} s`;
    }
    const whole = Math.round(seconds);
    if (whole < secondsPerMinute) {
        return `${whole} s`;
    }
    if (whole < secondsPerHour) {
        return `${Math.floor(whole / secondsPerMinute)}m ${String(whole % secondsPerMinute).padStart(2, '0')}s`;
    }
    const minutes = Math.round(whole / secondsPerMinute);
    return `${Math.floor(minutes / secondsPerMinute)}h ${String(minutes % secondsPerMinute).padStart(2, '0')}m`;
};

/** Amounts under a cent keep four decimals, so a dry run's estimate never reads as zero. */
const centsAndAbove = 0.01;

/** `USD 0.36`, `USD 0.0045`, `USD 0`. */
export const usdText = (amount: number): string =>
    amount === 0 ? 'USD 0' : `USD ${amount.toFixed(Math.abs(amount) >= centsAndAbove ? 2 : 4)}`;

/** `0.967` -> `96.7%`. */
export const percentText = (share: number): string => `${(share * 100).toFixed(1)}%`;

const bytesPerMebibyte = 1024 * 1024;

/** `583008256` -> `556 MiB`. */
export const mebibytesText = (bytes: number): string => `${countText(Math.round(bytes / bytesPerMebibyte))} MiB`;
