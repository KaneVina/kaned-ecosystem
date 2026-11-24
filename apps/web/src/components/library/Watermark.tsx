/**
 * A faint, repeating KANED laid over an internal document's viewer, so a
 * screenshot carries where it came from. It never takes a click or a scroll,
 * and stays light enough to read through. Each word has a dark fill and a light
 * edge, so it shows on white pages and on dark video alike.
 */
const W = 300;
const H = 200;
// One word in the middle of each tile, so no word is cut at a tile edge; a second layer shifted by
// half a tile fills the gaps in a staggered pattern.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-24 ${W / 2} ${H / 2})" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="24" letter-spacing="4.5" fill="rgba(18,24,38,0.07)" stroke="rgba(255,255,255,0.09)" stroke-width="0.8" paint-order="stroke">KANED</text></svg>`;
const TILE = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

export function Watermark() {
  return (
    <div
      className="wmk"
      aria-hidden
      style={{ backgroundImage: `${TILE}, ${TILE}`, backgroundSize: `${W}px ${H}px`, backgroundPosition: `0 0, ${W / 2}px ${H / 2}px` }}
    />
  );
}
