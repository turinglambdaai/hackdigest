import { useState } from 'react';
import { sanitizeHtml, timeAgo, translateComments, type HNItem } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSettings, useTrans, useUI } from '../state/store';
import { IconTranslate, IconChevronDown } from './icons';

export function buildTree(comments: HNItem[]): Map<number, HNItem[]> {
  const byParent = new Map<number, HNItem[]>();
  for (const c of comments) {
    if (c.parent == null) continue;
    const arr = byParent.get(c.parent);
    if (arr) arr.push(c);
    else byParent.set(c.parent, [c]);
  }
  return byParent;
}

interface NodeProps {
  item: HNItem;
  children: HNItem[] | undefined;
  tree: Map<number, HNItem[]>;
}

export function CommentNode({ item, children, tree }: NodeProps) {
  const { t, lang } = useI18n();
  const llm = useSettings((s) => s.settings.llm);
  const target = useSettings((s) => s.settings.translateTarget);
  const trans = useTrans((s) => s.map[item.id]);
  const put = useTrans((s) => s.put);
  const navigate = useUI((s) => s.navigate);
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const replyCount = (function count(nodes: HNItem[] | undefined): number {
    if (!nodes) return 0;
    let n = 0;
    for (const c of nodes) n += 1 + count(tree.get(c.id));
    return n;
  })(children);

  const translateOne = async () => {
    if (!llm) return navigate({ type: 'settings' });
    if (busy) return;
    setBusy(true);
    try {
      await translateComments(llm, [item], target, (batch) => {
        for (const [id, text] of batch) put(id, { text });
      });
    } catch {
      /* silent; retry button remains */
    } finally {
      setBusy(false);
    }
  };

  const bodyHtml = trans?.text ? trans.text : item.text ?? '';

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 text-xs text-mute">
        <button
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-raised"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <IconChevronDown width={12} height={12} className="rotate-[-90deg]" />
          ) : (
            <IconChevronDown width={12} height={12} />
          )}
          <span className="font-medium text-ink/80">{item.by ?? '?'}</span>
        </button>
        <span>{timeAgo(item.time, lang)}</span>
        {collapsed && replyCount > 0 && (
          <span className="text-accent">
            {replyCount} {t.replies}
          </span>
        )}
        <button
          title={t.translate}
          className={`ml-auto rounded p-1 hover:bg-raised ${trans?.text ? 'text-accent' : 'text-mute'}`}
          onClick={translateOne}
        >
          <IconTranslate className={busy ? 'animate-pulse' : ''} width={12} height={12} />
        </button>
      </div>

      {!collapsed && (
        <>
          <div
            className="prose-hn mt-1 text-[14px] text-ink/90"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
          />
          {trans?.text && item.text && (
            <details className="mt-1 text-xs text-mute" onToggle={(e) => setShowOriginal((e.target as HTMLDetailsElement).open)}>
              <summary className="cursor-pointer select-none hover:text-ink">{showOriginal ? t.hideOriginal : t.showOriginal}</summary>
              <div className="prose-hn mt-1" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.text) }} />
            </details>
          )}
          {children && children.length > 0 && (
            <div className="mt-2 ml-1 space-y-1 border-l border-line pl-3">
              {children.map((c) => (
                <CommentNode key={c.id} item={c} children={tree.get(c.id)} tree={tree} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
