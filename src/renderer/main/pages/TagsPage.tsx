import { useState, type DragEvent } from 'react';
import { LIMITS, TAG_COLORS, type TagNode } from '@shared/types';
import { Dialog, Popover } from '../components/Overlay';
import { Icon } from '../components/Icon';
import { api, call } from '../lib/api';
import { useReportError } from '../lib/data';
import { useUi } from '../lib/store';

const MAX_DEPTH = LIMITS.tagDepthMax - 1;

/** 标签管理（UI-07 / UI-08，FR-TGM-01~06） */
export function TagsPage({ tags }: { tags: TagNode[] }) {
  const report = useReportError();
  const showToast = useUi((s) => s.showToast);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [colorPop, setColorPop] = useState<{ tag: TagNode; anchor: HTMLElement } | null>(null);
  const [dialog, setDialog] = useState<{ kind: 'delete' | 'merge'; tag: TagNode } | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null; ok: boolean } | null>(null);

  const byId = new Map(tags.map((t) => [t.id, t]));
  const kids = (id: string) => tags.filter((t) => t.parentId === id);
  const subtree = (t: TagNode) => tags.filter((x) => x.path.startsWith(t.path));
  const height = (t: TagNode) => Math.max(...subtree(t).map((x) => x.depth)) - t.depth;

  const add = async (parentId: string | null) => {
    try {
      const base = parentId ? '新子标签' : '新标签';
      const siblings = new Set(tags.filter((t) => t.parentId === parentId).map((t) => t.name));
      let name = base;
      for (let i = 2; siblings.has(name); i++) name = `${base} ${i}`;
      const t = await call(api.tags.create({ name, parentId }));
      setRenaming(t.id);
    } catch (e) {
      report(e);
    }
  };

  const canDrop = (dragId: string, target: string | null): boolean => {
    const d = byId.get(dragId);
    if (!d || dragId === target) return false;
    if (target === null) return true;
    const t = byId.get(target)!;
    if (t.path.startsWith(d.path)) return false;
    return t.depth + 1 + height(d) <= MAX_DEPTH;
  };

  const dropProps = (target: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!drag) return;
      const ok = canDrop(drag.id, target);
      if (ok) e.preventDefault();
      e.dataTransfer.dropEffect = ok ? 'move' : 'none';
      if (drag.over !== target || drag.ok !== ok) setDrag({ ...drag, over: target, ok });
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (!drag || !canDrop(drag.id, target)) return;
      const name = byId.get(drag.id)!.name;
      void call(api.tags.move(drag.id, target))
        .then(() => showToast(`"${name}"已移到${target ? `"${byId.get(target)!.name}"下` : '根级'}`))
        .catch(report);
      setDrag(null);
    },
  });

  return (
    <main className="main" aria-label="标签管理">
      <header className="main-header">
        <button className="icon-btn" onClick={toggleSidebar} aria-label="折叠侧边栏">
          <Icon name="panelLeft" />
        </button>
        <div>
          <h1>标签管理</h1>
          <div className="sub">共 {tags.length} 个标签 · 最多 5 级 · 拖动行到另一标签上可调整层级</div>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => void add(null)}>
          <Icon name="plus" size={14} />
          新建标签
        </button>
      </header>
      <div className="main-scroll">
        {tags.length > 0 && (
          <div className="tag-table" role="tree" aria-label="标签树">
            {tags.map((t) => (
              <div
                key={t.id}
                className={`tag-row tc-${t.color} ${drag?.id === t.id ? 'dragging' : ''} ${
                  drag?.over === t.id ? (drag.ok ? 'drop-target' : 'drop-invalid') : ''
                }`}
                style={{ paddingLeft: 12 + t.depth * 24 }}
                draggable={renaming !== t.id}
                role="treeitem"
                aria-level={t.depth + 1}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDrag({ id: t.id, over: null, ok: false });
                }}
                onDragEnd={() => setDrag(null)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'F2') setRenaming(t.id);
                  if (e.key === 'Delete') setDialog({ kind: 'delete', tag: t });
                }}
                tabIndex={0}
                {...dropProps(t.id)}
              >
                <span className="handle" title="拖动以调整层级" aria-hidden="true">
                  <Icon name="grip" size={14} />
                </span>
                <span className="name">
                  <span className="dot" />
                  {renaming === t.id ? (
                    <RenameInput
                      tag={t}
                      onDone={(name) => {
                        setRenaming(null);
                        if (name && name !== t.name) void call(api.tags.update(t.id, { name })).catch(report);
                      }}
                    />
                  ) : (
                    <span>{t.name}</span>
                  )}
                  {t.depth > 0 && <span className="depth-hint">L{t.depth + 1}</span>}
                </span>
                <span className="count">{t.todoCount} 项</span>
                <span className="acts">
                  <button
                    className="icon-btn"
                    onClick={() => setRenaming(t.id)}
                    aria-label={`重命名 ${t.name}`}
                    title="重命名（F2）"
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={(e) => setColorPop({ tag: t, anchor: e.currentTarget })}
                    aria-label={`修改 ${t.name} 的颜色`}
                    title="颜色"
                  >
                    <Icon name="palette" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => void add(t.id)}
                    aria-label={`在 ${t.name} 下新建子标签`}
                    title={t.depth >= MAX_DEPTH ? '已达到 5 级上限' : '新建子标签'}
                    disabled={t.depth >= MAX_DEPTH}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => setDialog({ kind: 'merge', tag: t })}
                    aria-label={`合并 ${t.name}`}
                    title="合并到其他标签"
                    disabled={tags.length < 2}
                  >
                    <Icon name="merge" size={14} />
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={() => setDialog({ kind: 'delete', tag: t })}
                    aria-label={`删除 ${t.name}`}
                    title="删除（Delete）"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div
          className={`tag-row ${drag?.over === null && drag?.ok ? 'drop-target' : ''}`}
          style={{
            marginTop: 8,
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--foreground-subtle)',
            justifyContent: 'center',
          }}
          {...dropProps(null)}
        >
          {tags.length ? '拖到这里成为根标签' : '还没有标签，点右上角"新建标签"开始'}
        </div>
      </div>

      {colorPop && (
        <Popover anchor={colorPop.anchor} onClose={() => setColorPop(null)} label="标签颜色">
          <h3>标签颜色</h3>
          <div className="swatches">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch tc-${c}`}
                aria-pressed={colorPop.tag.color === c}
                aria-label={c}
                onClick={() => {
                  void call(api.tags.update(colorPop.tag.id, { color: c })).catch(report);
                  setColorPop(null);
                }}
              >
                <Icon name="check" size={14} />
              </button>
            ))}
          </div>
        </Popover>
      )}

      {dialog?.kind === 'delete' && (
        <DeleteDialog tag={dialog.tag} kids={kids(dialog.tag.id)} all={tags} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'merge' && <MergeDialog tag={dialog.tag} all={tags} onClose={() => setDialog(null)} />}
    </main>
  );
}

function RenameInput({ tag, onDone }: { tag: TagNode; onDone(name: string | null): void }) {
  const [v, setV] = useState(tag.name);
  return (
    <input
      className="input"
      aria-label="标签名称"
      value={v}
      maxLength={LIMITS.tagNameMax}
      autoFocus
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v.trim() || null);
        if (e.key === 'Escape') onDone(null);
      }}
    />
  );
}

function DeleteDialog({ tag, kids, all, onClose }: { tag: TagNode; kids: TagNode[]; all: TagNode[]; onClose(): void }) {
  const [mode, setMode] = useState<'promote' | 'delete'>('promote');
  const report = useReportError();
  const showToast = useUi((s) => s.showToast);
  const go = useUi((s) => s.go);
  const route = useUi((s) => s.route);
  const descendants = all.filter((t) => t.path.startsWith(tag.path) && t.id !== tag.id);
  const parent = all.find((t) => t.id === tag.parentId);
  const confirm = async () => {
    try {
      await call(api.tags.remove(tag.id, mode));
      if (route.kind === 'tag' && (route.tagId === tag.id || descendants.some((d) => d.id === route.tagId))) {
        go({ kind: 'page', page: 'tags' });
      }
      showToast(`已删除标签"${tag.name}"`);
      onClose();
    } catch (e) {
      report(e);
    }
  };
  return (
    <Dialog onClose={onClose} label={`删除标签 ${tag.name}`}>
      <h2>
        <Icon name="alert" size={18} />
        删除标签"{tag.name}"？
      </h2>
      <p>
        包含 {descendants.length} 个子标签，关联 {tag.openCount} 项未完成待办。待办本身<b>不会被删除</b>
        ，只会移除标签关联。
      </p>
      {kids.length > 0 && (
        <div className="options" role="radiogroup" aria-label="子标签处理">
          <label className="option">
            <input type="radio" name="children" checked={mode === 'promote'} onChange={() => setMode('promote')} />
            <div>
              <b>子标签上移一级</b>
              <span>
                "{kids.map((k) => k.name).join('、')}"将移到{parent ? `"${parent.name}"下` : '根级'}
              </span>
            </div>
          </label>
          <label className="option">
            <input type="radio" name="children" checked={mode === 'delete'} onChange={() => setMode('delete')} />
            <div>
              <b>一并删除子标签</b>
              <span>共删除 {descendants.length + 1} 个标签</span>
            </div>
          </label>
        </div>
      )}
      <div className="actions">
        <button className="btn" onClick={onClose} data-autofocus>
          取消
        </button>
        <button className="btn danger" onClick={() => void confirm()}>
          删除
        </button>
      </div>
    </Dialog>
  );
}

function MergeDialog({ tag, all, onClose }: { tag: TagNode; all: TagNode[]; onClose(): void }) {
  const targets = all.filter((t) => !t.path.startsWith(tag.path));
  const [to, setTo] = useState(targets[0]?.id ?? '');
  const report = useReportError();
  const showToast = useUi((s) => s.showToast);
  const confirm = async () => {
    try {
      await call(api.tags.merge(tag.id, to));
      showToast(`已将"${tag.name}"合并到"${all.find((t) => t.id === to)?.name}"`);
      onClose();
    } catch (e) {
      report(e);
    }
  };
  return (
    <Dialog onClose={onClose} label={`合并标签 ${tag.name}`}>
      <h2>
        <Icon name="merge" size={18} />
        合并"{tag.name}"
      </h2>
      <p>
        "{tag.name}"下的待办将改挂到目标标签（已挂的不重复），子标签移到目标下，然后删除"{tag.name}"。
      </p>
      <label className="field-label" htmlFor="merge-to">
        合并到
      </label>
      <select
        id="merge-to"
        className="select"
        style={{ marginBottom: 20 }}
        value={to}
        onChange={(e) => setTo(e.target.value)}
      >
        {targets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.displayPath}
          </option>
        ))}
      </select>
      <div className="actions">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button className="btn primary" disabled={!to} onClick={() => void confirm()}>
          合并
        </button>
      </div>
    </Dialog>
  );
}
