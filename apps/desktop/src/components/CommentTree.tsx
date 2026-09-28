import { useState } from 'react';
import { sanitizeHtml, timeAgo, translateComments, type HNItem } from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSettings, useTrans, useTree, useUI } from '../state/store';
import { IconTranslate, IconChevronDown } from './icons';
import { toast } from './Toast';

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

/** Comments visible under the current collapse state (folded subtrees skipped). */
export function collectVisible(
  roots: HNItem[],
  tree: Map<number, HNItem[]>,
  collapsed: Record<number, boolean>,
  out: HNItem[] = []
): HNItem[] {
  for (const n of roots) {
    out.push(n);
    if (!collapsed[n.id]) collectVisible(tree.get(n.id) ?? [], tree, collapsed, out);
  }
  return out;
}

interface NodeProps {
  item: HNItem;
  children: HNItem[] | undefined;
  tree: Map<number, HNItem[]>;
  kidsLoaded: boolean;
  onExpandKids: (item: HNItem) => void;
}

export function CommentNode({ item, children, tree, kidsLoaded, onExpandKids }: NodeProps) {
  const { t, lang } = useI18n();
  const llm = useSettings((s) => s.settings.llm);
  const target = useSettings((s) => s.settings.translateTarget);
  const trans = useTrans((s) => s.map[item.id]);
  const put = useTrans((s) => s.put);
  const navigate = useUI((s) => s.navigate);
  const collapsed = useTree((s) => !!s.collapsed[item.id]);
  const toggleCollapse = useTree((s) => s.toggleCollapse);
  const [busy, setBusy] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const replyCount = item.kids?.length ?? 0; // direct replies; descendants unknown until expanded
  const loadingKids = !kidsLoaded && replyCount > 0;

  const translateOne = async () => {
    if (!llm) { toast.info(t.noKeyTitle + ' — ' + t.goSettings); navigate({ type: 'settings' }); return; }
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
    <div className="group/node pt-2">
      <div className="flex items-center gap-2 text-xs text-mute">
        <button
          className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-raised"
          onClick={() => toggleCollapse(item.id)}
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
          title={t.translateOneComment}
          className={`ml-auto rounded-md p-1.5 transition-opacity hover:bg-raised ${
            trans?.text || busy
              ? 'text-accent opacity-100'
              : 'text-mute opacity-50 group-hover/node:opacity-100'
          }`}
          onClick={translateOne}
        >
          <IconTranslate className={busy ? 'animate-spin' : ''} width={13} height={13} />
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
                <CommentNode
                  key={c.id}
                  item={c}
                  children={tree.get(c.id)}
                  tree={tree}
                  kidsLoaded={tree.has(c.id) || !c.kids?.length}
                  onExpandKids={onExpandKids}
                />
              ))}
            </div>
          )}
          {loadingKids && (
            <button
              className="mt-2 ml-1 flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 text-[11px] text-mute hover:border-accent hover:text-accent"
              disabled={expanding}
              onClick={() => {
                setExpanding(true);
                Promise.resolve(onExpandKids(item)).finally(() => setExpanding(false));
              }}
            >
              {expanding ? (
                <IconChevronDown className="animate-pulse" width={11} height={11} />
              ) : (
                <IconChevronDown className="rotate-[-90deg]" width={11} height={11} />
              )}
              {t.expandReplies.replace('{n}', String(replyCount))}
            </button>
          )}
        </>
      )}
    </div>
  );
}
