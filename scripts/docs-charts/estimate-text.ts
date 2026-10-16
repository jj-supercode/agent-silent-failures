import { countText, percentText } from '../../src/command-output/index.ts';
import type { Estimate } from './model.ts';

/** `69.2% (83/120)`: the label printed beside a dot. */
export const estimateLabel = (estimate: Estimate): string =>
    `${percentText(estimate.share)} (${countText(estimate.events)}/${countText(estimate.trials)})`;

/** `83/120, 69.2% (95% CI 60.4% to 76.7%)`: the full reading, for tooltips and the text description. */
export const estimateReading = (estimate: Estimate): string =>
    `${countText(estimate.events)}/${countText(estimate.trials)}, ${percentText(estimate.share)} ` +
    `(95% CI ${percentText(estimate.lower)} to ${percentText(estimate.upper)})`;
