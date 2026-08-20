'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = async function flattenDeepSeekRuntime(context) {
  const appDir = path.join(context.appOutDir, 'resources', 'app');
  const sourceScope = path.join(
    appDir,
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'node_modules',
    '@deepseek-ai',
  );
  const targetScope = path.join(appDir, 'node_modules', '@deepseek-ai');

  if (!fs.existsSync(sourceScope)) {
    throw new Error(`DeepSeek runtime scope not found after pack: ${sourceScope}`);
  }

  fs.mkdirSync(targetScope, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(sourceScope, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = path.join(sourceScope, entry.name);
    const target = path.join(targetScope, entry.name);
    if (fs.existsSync(target)) continue;
    fs.cpSync(source, target, { recursive: true, dereference: true });
    copied += 1;
  }
  console.log(`[after-pack] flattened ${copied} DeepSeek runtime packages`);
};
