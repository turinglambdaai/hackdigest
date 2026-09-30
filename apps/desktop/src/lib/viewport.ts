// Shared IntersectionObserver for viewport-triggered translation.
// One-shot: fires when an element enters the viewport (+300px preload),
// then stops watching it.

type Cb = () => void;
const listeners = new WeakMap<Element, Cb>();

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const cb = listeners.get(e.target);
      io.unobserve(e.target);
      cb?.();
    }
  },
  { rootMargin: '300px 0px' }
);

export function watchVisible(el: Element, cb: Cb): () => void {
  listeners.set(el, cb);
  io.observe(el);
  return () => {
    io.unobserve(el);
  };
}
