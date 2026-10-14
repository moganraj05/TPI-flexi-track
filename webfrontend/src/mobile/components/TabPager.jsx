import { Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loading } from './ui';

// Swipe between the bottom-dock tabs, following the finger: the current
// screen moves with the drag while the next (or previous) one slides in
// beside it, then it snaps to that tab or back. Tapping the dock still works.
//
// The tab on each side of the current one stays mounted (hidden) so it is
// ready to show the moment a drag starts. Panels are keyed by route, so the
// screen you swipe to is the same instance afterwards — no reload, no flash.
//
// A swipe doesn't start:
// - with a mouse (touch and pen only),
// - within EDGE_GUARD of either screen edge (left to the phone's own back
//   gesture),
// - inside something that scrolls sideways (chips, tables), a form field,
//   or anything marked data-no-swipe,
// - while a bottom sheet is open.
// Mostly-vertical moves are left to the browser's normal scrolling
// (touch-action: pan-y on .m-swipe-tabs), which also stops the browser's
// own sideways "go back" gesture from firing on these screens.

const EDGE_GUARD = 20; // px
const LOCK_DISTANCE = 10; // px moved before deciding sideways vs. up/down
const COMMIT_RATIO = 0.3; // of the screen width
const COMMIT_VELOCITY = 0.45; // px per ms — a quick flick also switches
const EDGE_RESISTANCE = 0.3; // drag past the first / last tab
const SETTLE_MS = 280; // matches .m-tabswipe-settling in mobile.css

function startsInSideScroller(el, root) {
  for (let node = el; node && node !== root; node = node.parentElement) {
    if (node.matches?.('input, textarea, select, [data-no-swipe]')) return true;
    if (node.scrollWidth > node.clientWidth + 1) {
      const { overflowX } = getComputedStyle(node);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

// One click straight after a swipe is swallowed, so lifting the finger over
// a button doesn't also press it.
function swallowNextClick() {
  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 400);
}

// `tabs`: [{ to, element }] in dock order.
export function TabPager({ tabs }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const path = pathname.replace(/\/+$/, '') || '/';
  const index = tabs.findIndex((t) => t.to === path);

  const rootRef = useRef(null);
  const latest = useRef(null);
  latest.current = { index, tabs, navigate };
  const resetAfterSwitch = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    // Swipes are picked up anywhere in the app (also below a short page and
    // on the dock), not just on the page content. Bottom sheets live in a
    // portal outside it, so they never start one.
    const area = root?.closest('.m-root');
    if (!root || !area) return undefined;
    area.classList.add('m-swipe-tabs');

    let gesture = null;
    let settling = false;

    const panel = (role) => root.querySelector(`[data-pager="${role}"]`);
    const place = (dx) => {
      const current = panel('current');
      const prev = panel('prev');
      const next = panel('next');
      if (current) current.style.transform = `translate3d(${dx}px, 0, 0)`;
      if (prev) prev.style.transform = `translate3d(calc(-100% + ${dx}px), 0, 0)`;
      if (next) next.style.transform = `translate3d(calc(100% + ${dx}px), 0, 0)`;
    };
    const clear = () => {
      root.classList.remove('m-tabswipe-dragging', 'm-tabswipe-settling');
      root.querySelectorAll('[data-pager]').forEach((p) => p.style.removeProperty('transform'));
    };

    const settle = (dx, done) => {
      settling = true;
      root.classList.add('m-tabswipe-settling');
      void root.offsetWidth; // apply the transition before the move
      place(dx);
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        settling = false;
        done();
      };
      panel('current')?.addEventListener('transitionend', finish, { once: true });
      setTimeout(finish, SETTLE_MS + 80);
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || settling || gesture) return;
      if (e.clientX < EDGE_GUARD || e.clientX > window.innerWidth - EDGE_GUARD) return;
      if (document.querySelector('.m-sheet-backdrop')) return;
      if (startsInSideScroller(e.target, area)) return;
      gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, lastX: e.clientX, lastT: e.timeStamp, v: 0, locked: false };
    };

    const onMove = (e) => {
      if (!gesture || e.pointerId !== gesture.id) return;
      const rawDx = e.clientX - gesture.x0;
      const dy = e.clientY - gesture.y0;

      if (!gesture.locked) {
        if (Math.abs(rawDx) < LOCK_DISTANCE && Math.abs(dy) < LOCK_DISTANCE) return;
        if (Math.abs(rawDx) <= Math.abs(dy) * 1.2) {
          gesture = null; // up/down: the page scrolls as usual
          return;
        }
        gesture.locked = true;
        root.classList.add('m-tabswipe-dragging');
        try {
          area.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
      }

      const { index: i, tabs: list } = latest.current;
      const blocked = (rawDx > 0 && i <= 0) || (rawDx < 0 && i >= list.length - 1);
      gesture.dx = blocked ? rawDx * EDGE_RESISTANCE : rawDx;

      const dt = e.timeStamp - gesture.lastT;
      if (dt > 0) gesture.v = 0.8 * ((e.clientX - gesture.lastX) / dt) + 0.2 * gesture.v;
      gesture.lastX = e.clientX;
      gesture.lastT = e.timeStamp;

      place(gesture.dx);
    };

    const onEnd = (e) => {
      if (!gesture || e.pointerId !== gesture.id) return;
      const g = gesture;
      gesture = null;
      if (!g.locked) return;
      swallowNextClick();

      const { index: i, tabs: list, navigate: go } = latest.current;
      const width = root.clientWidth || window.innerWidth;
      const step = g.dx < 0 ? 1 : -1; // dragged left → next tab
      const target = list[i + step];
      const far = Math.abs(g.dx) > width * COMMIT_RATIO;
      const flick = Math.abs(g.v) > COMMIT_VELOCITY && Math.sign(g.v) === Math.sign(g.dx);

      if (e.type !== 'pointercancel' && target && (far || flick)) {
        settle(-step * width, () => {
          resetAfterSwitch.current = true;
          go(target.to, { replace: true });
        });
      } else {
        settle(0, clear);
      }
    };

    area.addEventListener('pointerdown', onDown);
    area.addEventListener('pointermove', onMove);
    area.addEventListener('pointerup', onEnd);
    area.addEventListener('pointercancel', onEnd);
    return () => {
      area.classList.remove('m-swipe-tabs');
      area.removeEventListener('pointerdown', onDown);
      area.removeEventListener('pointermove', onMove);
      area.removeEventListener('pointerup', onEnd);
      area.removeEventListener('pointercancel', onEnd);
    };
  }, []);

  // After a swipe the new tab is already fully on screen (shown from its
  // top), so before the browser paints: start it at the top of the page and
  // drop the drag offsets — nothing visibly moves.
  useLayoutEffect(() => {
    if (!resetAfterSwitch.current) return;
    resetAfterSwitch.current = false;
    const root = rootRef.current;
    window.scrollTo(0, 0);
    root?.classList.remove('m-tabswipe-dragging', 'm-tabswipe-settling');
    root?.querySelectorAll('[data-pager]').forEach((p) => p.style.removeProperty('transform'));
  }, [index]);

  if (index === -1) return null;

  const panels = [-1, 0, 1]
    .map((offset) => ({ offset, tab: tabs[index + offset] }))
    .filter((p) => p.tab);

  return (
    <div ref={rootRef} className="m-tabswipe">
      {panels.map(({ offset, tab }) => {
        const role = offset === 0 ? 'current' : offset < 0 ? 'prev' : 'next';
        return (
          <div
            key={tab.to}
            data-pager={role}
            className={`m-tabswipe-panel${offset === 0 ? '' : ' m-tabswipe-side'}`}
            inert={offset !== 0}
            aria-hidden={offset !== 0 || undefined}
          >
            <Suspense fallback={offset === 0 ? <Loading /> : null}>{tab.element}</Suspense>
          </div>
        );
      })}
    </div>
  );
}
