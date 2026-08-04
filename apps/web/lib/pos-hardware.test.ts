import { beforeEach, describe, expect, it, vi } from 'vitest';
import { printServerSvg, printServerSvgLabels } from './pos-hardware';

/**
 * UI-PRINT. Browser print popups for server-rendered SVG documents: the batch
 * variant prints one warehouse label per page, and the optional caption turns a
 * bare QR into a readable price tag. window/open are stubbed (node env).
 */
function stubPopup() {
  const written: string[] = [];
  const popup = {
    document: {
      write: vi.fn((html: string) => { written.push(html); }),
      close: vi.fn(),
    },
    focus: vi.fn(),
    print: vi.fn(),
  };
  const open = vi.fn(() => popup);
  vi.stubGlobal('window', { open, setTimeout: (fn: () => void) => fn() });
  return { open, popup, html: () => written.join('') };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('printServerSvg (UI-PRINT)', () => {
  it('writes the SVG into a popup and triggers print', () => {
    const { popup, html } = stubPopup();
    printServerSvg('<svg>receipt</svg>', 'Чек 1');
    expect(html()).toContain('<svg>receipt</svg>');
    expect(popup.document.close).toHaveBeenCalledTimes(1);
    expect(popup.print).toHaveBeenCalledTimes(1);
  });

  it('renders the escaped caption above the SVG (price tag)', () => {
    const { html } = stubPopup();
    printServerSvg('<svg>qr</svg>', 'Ценник', 'iPhone 15 <Pro> · 100 000 сом');
    expect(html()).toContain('iPhone 15 &lt;Pro&gt; · 100 000 сом');
    expect(html()).not.toContain('<Pro>');
  });
});

describe('printServerSvgLabels (UI-PRINT)', () => {
  it('writes every label with a page break in a single popup', () => {
    const { open, popup, html } = stubPopup();
    printServerSvgLabels(['<svg>a</svg>', '<svg>b</svg>', '<svg>c</svg>'], 'Этикетки (3)');
    expect(open).toHaveBeenCalledTimes(1);
    expect(html().match(/class="label"/g)).toHaveLength(3);
    expect(html()).toContain('page-break-after: always');
    expect(html()).toContain('<svg>a</svg>');
    expect(html()).toContain('<svg>c</svg>');
    expect(popup.print).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty batch', () => {
    const { open } = stubPopup();
    printServerSvgLabels([], 'пусто');
    expect(open).not.toHaveBeenCalled();
  });
});
