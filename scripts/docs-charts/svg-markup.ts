/** Attribute values as SVG takes them; numbers are rounded to one decimal so output stays byte-stable. */
type Attributes = Readonly<Record<string, string | number>>;

const xmlEscapes: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export const escapeXml = (text: string): string =>
    text.replaceAll(/[&<>"]/g, (character) => xmlEscapes[character] ?? '');

const attributeValue = (value: string | number): string =>
    typeof value === 'number' ? String(Math.round(value * 10) / 10) : escapeXml(value);

const attributeText = (attributes: Attributes): string =>
    Object.entries(attributes)
        .map(([name, value]) => ` ${name}="${attributeValue(value)}"`)
        .join('');

/** One element; children are already markup, one per line. An element without children closes itself. */
export const element = (tag: string, attributes: Attributes, children: readonly string[] = []): string =>
    children.length === 0
        ? `<${tag}${attributeText(attributes)}/>`
        : `<${tag}${attributeText(attributes)}>${children.join('\n')}</${tag}>`;

/** A text node: escaped, never markup. */
export const textElement = (attributes: Attributes, text: string): string =>
    `<text${attributeText(attributes)}>${escapeXml(text)}</text>`;
