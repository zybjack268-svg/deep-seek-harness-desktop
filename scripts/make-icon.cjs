'use strict';

/**
 * 从 DSH 前端的 favicon.svg 提取 DeepSeek 鲸鱼 logo，
 * 生成：
 *   - assets/icon.png  512x512 白底圆角 + 黑色鲸鱼（electron-builder 会自动派生 .ico/.icns）
 *   - assets/icon.ico  多尺寸（256/64/48/32/16）PNG 压缩 ICO，供桌面快捷方式使用
 */
const fs = require('node:fs');
const path = require('node:path');

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    try {
      return require('C:/Users/张/AppData/Local/npm-cache/_npx/1e7f6d9597241db0/node_modules/sharp');
    } catch {
      throw new Error('找不到 sharp，请先在项目里 npm i sharp。');
    }
  }
}

function extractWhalePath(faviconPath) {
  const raw = fs.readFileSync(faviconPath, 'utf8');
  const m = raw.match(/<path[^>]*\bd="([^"]+)"/);
  if (!m) throw new Error('favicon.svg 中未找到鲸鱼 path');
  return m[1];
}

/** 组装 PNG 压缩的 ICO 文件。 */
function buildIco(entries) {
  // entries: [{ size: number, png: Buffer }]
  const count = entries.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4); // count

  const dir = Buffer.alloc(count * entrySize);
  let offset = dataOffset;
  entries.forEach((e, i) => {
    const base = i * entrySize;
    // 256 用 0 表示
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, base + 0); // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, base + 1); // height
    dir.writeUInt8(0, base + 2); // palette
    dir.writeUInt8(0, base + 3); // reserved
    dir.writeUInt16LE(1, base + 4); // color planes
    dir.writeUInt16LE(32, base + 6); // bits per pixel
    dir.writeUInt32LE(e.png.length, base + 8); // bytes in resource
    dir.writeUInt32LE(offset, base + 12); // image offset
    offset += e.png.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

(async () => {
  const sharp = loadSharp();
  const root = path.join(__dirname, '..');
  const faviconPath = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'favicon.svg');
  const d = extractWhalePath(faviconPath);

  // 1) 白底圆角方 + 居中黑色鲸鱼（占约 70%）。
  const whaleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path d="${d}" fill="#000000"/></svg>`;

  // 高分辨率栅格化鲸鱼（透明底）→ 裁剪到内容 → 缩放到目标尺寸。
  const whaleRaw = await sharp(Buffer.from(whaleSvg))
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const whaleTrimmed = await sharp(whaleRaw).trim().toBuffer();
  const whaleSized = await sharp(whaleTrimmed)
    .resize(360, 360, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const bgSvg = `<svg width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#ffffff"/></svg>`;
  const bg = await sharp(Buffer.from(bgSvg)).png().toBuffer();
  const icon = await sharp(bg).composite([{ input: whaleSized, gravity: 'center' }]).png().toBuffer();

  const pngPath = path.join(root, 'assets', 'icon.png');
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, icon);

  // 2) 生成多尺寸 ICO。
  const sizes = [256, 64, 48, 32, 16];
  const entries = [];
  for (const size of sizes) {
    const buf = await sharp(icon).resize(size, size).png().toBuffer();
    entries.push({ size, png: buf });
  }
  const ico = buildIco(entries);
  const icoPath = path.join(root, 'assets', 'icon.ico');
  fs.writeFileSync(icoPath, ico);

  console.log('generated:', pngPath);
  console.log('generated:', icoPath);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
