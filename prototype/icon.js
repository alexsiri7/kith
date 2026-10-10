// Draws the app icon, a Kith's face in the shapes drawCreature uses, straight into a PNG (no canvas in Node).
const zlib = require('zlib');

function hsl(h, s, l) {
  s /= 100; l /= 100;
  const f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4), 255];
}
const HUE = 28, INK = [0x2a, 0x22, 0x30, 255], WHITE = [255, 255, 255, 255];
const BODY = hsl(HUE, 55, 58), LIGHT = hsl(HUE, 55, 78), CHEEK = [...hsl((HUE + 330) % 360, 70, 70).slice(0, 3), 140];
const ellipse = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const circle = (cx, cy, r) => ellipse(cx, cy, r, r);
const triangle = (a, b, c) => (x, y) => {
  const side = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const s1 = side(a, b), s2 = side(b, c), s3 = side(c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
};
// The happy mouth: a stroked arc along the lower half of a circle, as g.arc(cx, cy, r, from, to) draws it.
const arc = (cx, cy, r, from, to, width) => (x, y) => {
  const a = Math.atan2(y - cy, x - cx);
  if (a >= from && a <= to) return Math.abs(Math.hypot(x - cx, y - cy) - r) <= width / 2;
  return [from, to].some(e => Math.hypot(x - cx - r * Math.cos(e), y - cy - r * Math.sin(e)) <= width / 2);
};
// In drawCreature's coordinates: the body stands on y = 0 and the ear tips reach y = -94.
const FACE = [
  [BODY, triangle([-18, -58], [-30, -92], [-4, -64])], [BODY, triangle([14, -60], [26, -94], [2, -64])],
  [BODY, ellipse(0, -34, 30, 32)], [LIGHT, circle(4, -26, 17)],
  [WHITE, ellipse(-5, -45, 8, 9)], [WHITE, ellipse(15, -45, 8, 9)],
  [INK, circle(-3, -44, 4.5)], [INK, circle(17, -44, 4.5)],
  [WHITE, circle(-2, -46, 1.3)], [WHITE, circle(18, -46, 1.3)],
  [CHEEK, circle(-12, -33, 4)], [CHEEK, circle(24, -33, 4)],
  [INK, arc(6, -34, 5, 0.3, Math.PI - 0.3, 2)]
];
// The face's bounding box is 60 wide and 92 tall around this centre; its farthest point, an ear tip, is 53 away.
const CENTRE = { x: 0, y: -48 }, EXTENT = 50;

function over(dst, [r, g, b, a]) {
  const sa = a / 255, da = dst[3] / 255, oa = sa + da * (1 - sa);
  if (oa === 0) return [0, 0, 0, 0];
  const mix = (s, d) => (s * sa + d * da * (1 - sa)) / oa;
  return [mix(r, dst[0]), mix(g, dst[1]), mix(b, dst[2]), oa * 255];
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

// fill: how much of the icon's width 2 * EXTENT spans. background: a #rrggbb colour behind the face,
// which launchers that crop icons (maskable, iOS) need; without one the face stands on transparency.
function kithIcon(size, { fill, background }) {
  const bg = background ? [...Buffer.from(background.slice(1), 'hex'), 255] : [0, 0, 0, 0];
  const scale = size * fill / (2 * EXTENT), SS = 4, rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let sum = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = CENTRE.x + ((px + (sx + 0.5) / SS) - size / 2) / scale, y = CENTRE.y + ((py + (sy + 0.5) / SS) - size / 2) / scale;
      let c = bg;
      for (const [colour, inside] of FACE) if (inside(x, y)) c = over(c, colour);
      // Average premultiplied, so transparent samples don't darken the edge.
      sum = [sum[0] + c[0] * c[3], sum[1] + c[1] * c[3], sum[2] + c[2] * c[3], sum[3] + c[3]];
    }
    const i = (py * size + px) * 4, a = sum[3] / (SS * SS);
    if (a > 0) { rgba[i] = Math.round(sum[0] / sum[3]); rgba[i + 1] = Math.round(sum[1] / sum[3]); rgba[i + 2] = Math.round(sum[2] / sum[3]); }
    rgba[i + 3] = Math.round(a);
  }
  return png(size, rgba);
}

module.exports = { kithIcon };
