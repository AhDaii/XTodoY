// 纯函数：发布说明解析、版本比较、更新错误分类（SRS F10）
import type { ReleaseNote } from '@shared/update';

const KINDS: Record<string, ReleaseNote['kind']> = { 新增: 'new', 改进: 'imp', 修复: 'fix' };

/**
 * 把 GitHub Release 的说明（HTML 或 Markdown）整理为"新增 / 改进 / 修复"条目。
 * 支持两种写法：分组标题（### 新增）下的列表，或每行以"新增："开头。
 */
export function parseReleaseNotes(raw: string | null | undefined): ReleaseNote[] {
  if (!raw) return [];
  const text = raw
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const notes: ReleaseNote[] = [];
  let section: ReleaseNote['kind'] = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // 分隔线之后是只给 GitHub 页面看的下载表格与安装提示，不显示在程序里
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) break;
    const heading = /^#{1,6}\s*(.+?)\s*$/.exec(line);
    if (heading) {
      section = KINDS[heading[1]!.replace(/[:：]$/, '')] ?? null;
      continue;
    }
    if (KINDS[line.replace(/[:：]$/, '')] !== undefined) {
      section = KINDS[line.replace(/[:：]$/, '')]!;
      continue;
    }
    const item = line.replace(/^[-*+•]\s+|^\d+[.)]\s+/, '');
    const prefixed = /^(新增|改进|修复)\s*[:：]\s*(.+)$/.exec(item);
    if (prefixed) notes.push({ kind: KINDS[prefixed[1]!]!, text: prefixed[2]! });
    else notes.push({ kind: section, text: item });
  }
  return notes.slice(0, 50);
}

/**
 * 从 GitHub 的 releases.atom 中取出某个版本的说明（HTML）与发布时间（#25）。
 * 用 Atom 而不是 REST API：匿名 REST API 每个 IP 每小时只有 60 次，共用出口 IP 时经常被限流（403）。
 */
export function notesFromFeed(xml: string, version: string): { notes: string; releaseDate: string } | null {
  const tag = `/releases/tag/v${version}"`;
  for (const entry of xml.split('<entry>').slice(1)) {
    if (!entry.includes(tag)) continue;
    const content = /<content type="html">([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? '';
    const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1] ?? '';
    // Atom 中的 HTML 经过一次实体转义，先还原成 HTML 再交给 parseReleaseNotes
    const html = content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
    return { notes: html, releaseDate: updated };
  }
  return null;
}

/** 语义化版本比较；预发布版本低于同号正式版（1.1.0-beta.2 < 1.1.0） */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = '', pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number(n) || 0), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  const xs = x.pre.split('.');
  const ys = y.pre.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    const p = xs[i];
    const q = ys[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const d = /^\d+$/.test(p) && /^\d+$/.test(q) ? Number(p) - Number(q) : p.localeCompare(q);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** 把下载 / 检查失败的原因转成用户能理解的说明（FR-UPD-02 ②、FR-UPD-05） */
export function describeUpdateError(e: unknown): string {
  const msg = e instanceof Error ? `${(e as { code?: string }).code ?? ''} ${e.message}` : String(e);
  if (/sha512|checksum|integrity/i.test(msg)) return '更新文件校验失败，请稍后重试';
  if (/No published versions|Unable to find latest version/i.test(msg)) return '发布页上还没有可用的安装包';
  if (/CERT|SSL|TLS|self.signed|UNABLE_TO_VERIFY/i.test(msg)) return '安全连接校验失败，请检查系统时间或网络代理设置';
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|net::ERR/i.test(msg))
    return '无网络连接，请检查网络后重试';
  if (/ENOSPC/i.test(msg)) return '磁盘空间不足，无法下载更新';
  if (/EPERM|EACCES|EBUSY/i.test(msg)) return '没有权限写入更新文件，请稍后重试';
  if (/\b(404|5\d\d)\b|HttpError/i.test(msg)) return '更新服务器不可用，请稍后重试';
  return '检查更新失败，请稍后重试';
}
