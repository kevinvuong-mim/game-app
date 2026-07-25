import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';

const FONT_WEIGHTS = [400, 500, 600, 700] as const;
const FONT_FAMILIES = ['Fredoka'] as const;

/**
 * iOS WKWebView only exposes web fonts to canvas after they are used in the DOM.
 * A hidden probe element forces registration before Phaser renders text.
 */
function primeFontsForCanvas(): void {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;left:-9999px;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';

  for (const family of FONT_FAMILIES) {
    for (const weight of FONT_WEIGHTS) {
      const span = document.createElement('span');
      span.style.fontFamily = `"${family}"`;
      span.style.fontWeight = String(weight);
      span.textContent = 'Ag';
      probe.appendChild(span);
    }
  }

  document.body.appendChild(probe);
}

export async function loadGameFonts(): Promise<void> {
  const loads = FONT_FAMILIES.flatMap((family) =>
    FONT_WEIGHTS.map((weight) => document.fonts.load(`${weight} 16px "${family}"`))
  );

  await Promise.all(loads);
  await document.fonts.ready;
  primeFontsForCanvas();
}
