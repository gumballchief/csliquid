const fs   = require('fs');
const path = require('path');

const W = 32, H = 32;

// BITMAPINFOHEADER (40 bytes) — height doubled for ICO (XOR + AND mask rows)
const dib = Buffer.alloc(40);
dib.writeUInt32LE(40,    0);  // biSize
dib.writeInt32LE(W,      4);  // biWidth
dib.writeInt32LE(H * 2,  8);  // biHeight (ICO: doubled)
dib.writeUInt16LE(1,     12); // biPlanes
dib.writeUInt16LE(32,    14); // biBitCount (32-bit BGRA)
// remaining fields = 0 (BI_RGB, zero DPI)

// Pixel data: BGRA, bottom-up row order
const px = Buffer.alloc(W * H * 4);

function put(col, row, r, g, b) {
  if (col < 0 || col >= W || row < 0 || row >= H) return;
  const i = ((H - 1 - row) * W + col) * 4;
  px[i] = b; px[i+1] = g; px[i+2] = r; px[i+3] = 255;
}

// Black background
for (let r = 0; r < H; r++)
  for (let c = 0; c < W; c++)
    put(c, r, 0, 0, 0);

// Orange "C" shape — rows 2-13, cols 1-13  #FF6B00
for (let r = 2; r <= 13; r++) {
  for (let c = 1; c <= 13; c++) {
    const top    = r <= 4;
    const bottom = r >= 11;
    const left   = c <= 4;
    const inside = c >= 7 && r >= 5 && r <= 10;
    if ((top || bottom || left) && !inside)
      put(c, r, 255, 107, 0);
  }
}

// Orange "S" shape — rows 2-13, cols 16-28
for (let r = 2; r <= 13; r++) {
  for (let c = 16; c <= 28; c++) {
    const top  = r <= 4;
    const mid  = r >= 7 && r <= 8;
    const bot  = r >= 11;
    const lBot = c <= 19 && r >= 9;
    const rTop = c >= 25 && r <= 7;
    if (top || mid || bot || lBot || rTop)
      put(c, r, 255, 107, 0);
  }
}

// White knife blade — narrow triangle pointing up, rows 17-28, centred on col 15
for (let r = 17; r <= 28; r++) {
  const halfW = Math.round((r - 17) / 11 * 2);
  for (let c = 15 - halfW; c <= 15 + halfW; c++)
    put(c, r, 255, 255, 255);
}
// Knife handle
for (let r = 29; r <= 31; r++)
  for (let c = 13; c <= 17; c++)
    put(c, r, 90, 90, 90);

// White IQUID block — rows 17-28, cols 19-31
for (let r = 17; r <= 28; r++)
  for (let c = 19; c <= 31; c++)
    put(c, r, 255, 255, 255);

// AND mask — 4 bytes per row, all 0 = fully opaque
const andMask = Buffer.alloc(H * 4, 0);

const imgData = Buffer.concat([dib, px, andMask]);

// ICO file header (6 bytes)
const hdr = Buffer.alloc(6);
hdr.writeUInt16LE(0, 0); // reserved
hdr.writeUInt16LE(1, 2); // type ICO
hdr.writeUInt16LE(1, 4); // 1 image

// Directory entry (16 bytes)
const dir = Buffer.alloc(16);
dir[0] = W; dir[1] = H; dir[2] = 0; dir[3] = 0;
dir.writeUInt16LE(1,              4);  // planes
dir.writeUInt16LE(32,             6);  // bits per pixel
dir.writeUInt32LE(imgData.length, 8);  // bytes in resource
dir.writeUInt32LE(22,             12); // image data offset = 6 + 16

const out = path.join(__dirname, '..', 'public', 'favicon.ico');
fs.writeFileSync(out, Buffer.concat([hdr, dir, imgData]));
console.log('Written ' + out + ' (' + (6 + 16 + imgData.length) + ' bytes)');
