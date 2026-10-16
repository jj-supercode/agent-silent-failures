import { describe, expect, test } from 'vitest';

import { element, escapeXml, textElement } from './svg-markup.ts';

describe('svg markup', () => {
    test('escapes markup characters in text and attributes', () => {
        expect(escapeXml('a < b & "c" > d')).toBe('a &lt; b &amp; &quot;c&quot; &gt; d');
        expect(textElement({ title: 'x"y' }, '<S1>')).toBe('<text title="x&quot;y">&lt;S1&gt;</text>');
    });

    test('rounds numeric attributes to one decimal, so output stays byte-stable', () => {
        expect(element('circle', { cx: 10.04, cy: 2.25, r: 5 })).toBe('<circle cx="10" cy="2.3" r="5"/>');
    });

    test('puts each child on its own line', () => {
        expect(element('g', {}, ['<a/>', '<b/>'])).toBe('<g><a/>\n<b/></g>');
    });
});
