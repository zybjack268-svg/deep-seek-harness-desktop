'use strict';
// 从 DSH 前端 favicon 提取鲸鱼 path，生成 src/whale.svg（透明底黑色鲸鱼）。
const fs = require('node:fs');
const path = require('node:path');

const favicon = path.join(__dirname, '..', 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'favicon.svg');
const raw = fs.readFileSync(favicon, 'utf8');
const m = raw.match(/<path[^>]*\bd="([^"]+)"/);
if (!m) throw new Error('whale path not found in favicon.svg');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path d="${m[1]}" fill="#000000"/></svg>`;
const out = path.join(__dirname, '..', 'src', 'whale.svg');
fs.writeFileSync(out, svg, 'utf8');
console.log('wrote', out);
