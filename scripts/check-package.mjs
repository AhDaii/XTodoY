// 打包后检查 app.asar 的内容（CI 与发布流水线中执行）：
// electron-builder 的平台级 files 会整体替换顶层列表，写错时会把源码、测试甚至旧安装包打进去（P7 曾出现 424 MB 的 app.asar）。
// 用法：node scripts/check-package.mjs <unpacked 目录或 .app 的 Resources 目录>
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const dir = process.argv[2];
if (!dir) throw new Error('用法：node scripts/check-package.mjs <resources 所在目录>');
const resources = existsSync(join(dir, 'resources', 'app.asar')) ? join(dir, 'resources') : dir;
const file = join(resources, 'app.asar');
const entries = asar.listPackage(file).map((e) => e.replaceAll('\\', '/'));
const sizeMB = statSync(file).size / 1024 / 1024;

const forbidden = ['/src/', '/tests/', '/release/', '/design/', '/docs/', '/node_modules/better-sqlite3/build/'];
const bad = entries.filter((e) => forbidden.some((f) => `${e}/`.startsWith(f)));
const top = [...new Set(entries.map((e) => e.split('/')[1]))].sort();
console.log(`app.asar ${sizeMB.toFixed(1)} MB，${entries.length} 项，顶层：${top.join(', ')}`);

const errors = [];
if (bad.length) errors.push(`包含不应打包的文件（${bad.length} 项），例如：${bad.slice(0, 5).join(', ')}`);
if (!entries.includes('/out/main/index.js')) errors.push('缺少 /out/main/index.js');
if (sizeMB > 20) errors.push(`app.asar 过大：${sizeMB.toFixed(1)} MB（预期 < 20 MB）`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
