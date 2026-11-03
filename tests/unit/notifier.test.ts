import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Notification: class {} }));
const { parseProtocolUrl, toastXml } = await import('../../src/main/platform/notifier');

describe('toastXml', () => {
  it('包含标题、正文与两个 protocol 按钮，并转义特殊字符', () => {
    const xml = toastXml({ todoId: 'a b', title: '<评审> & "原型"', body: '今天 10:00' }, 10);
    expect(xml).toContain('&lt;评审&gt; &amp; &quot;原型&quot;');
    expect(xml).toContain('arguments="xtodoy://complete?id=a%20b"');
    expect(xml).toContain('稍后提醒（10 分钟）');
    expect(xml.match(/<action /g)).toHaveLength(2);
  });

  it('提醒声音关闭时静音，开启时使用系统默认声音（FR-REM-11）', () => {
    const n = { todoId: 't', title: '周会', body: '' };
    expect(toastXml(n, 10, false)).toContain('<audio silent="true"/>');
    expect(toastXml(n, 10, true)).not.toContain('<audio');
  });
});

describe('parseProtocolUrl', () => {
  it('解析三种动作', () => {
    expect(parseProtocolUrl('xtodoy://complete?id=t1')).toEqual({ action: 'complete', id: 't1' });
    expect(parseProtocolUrl('xtodoy://snooze?id=t1')).toEqual({ action: 'snooze', id: 't1' });
    expect(parseProtocolUrl('xtodoy://open?id=a%20b')).toEqual({ action: 'open', id: 'a b' });
  });
  it('拒绝未知协议、未知动作和缺少 id', () => {
    expect(parseProtocolUrl('https://complete?id=t1')).toBeNull();
    expect(parseProtocolUrl('xtodoy://delete?id=t1')).toBeNull();
    expect(parseProtocolUrl('xtodoy://complete')).toBeNull();
    expect(parseProtocolUrl('not a url')).toBeNull();
  });
});
