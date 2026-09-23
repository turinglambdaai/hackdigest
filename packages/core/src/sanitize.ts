// HTML sanitizer for HN item text (and LLM outputs rendered as HTML).
// Uses DOMParser with a tag/attribute allowlist.

const ALLOWED_TAGS = new Set(['P', 'A', 'I', 'EM', 'B', 'STRONG', 'CODE', 'PRE', 'BR', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'SPAN']);
const ALLOWED_ATTRS = new Set(['href']);

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Keep the text, drop the unknown wrapper.
        const frag = doc.createTextNode(child.textContent ?? '');
        child.replaceWith(frag);
        continue;
      }
      for (const attr of Array.from(child.attributes)) {
        if (!ALLOWED_ATTRS.has(attr.name)) child.removeAttribute(attr.name);
      }
      const href = child.getAttribute('href');
      if (child.tagName === 'A' && href) {
        if (!/^https?:/i.test(href)) child.removeAttribute('href');
        else {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        }
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
