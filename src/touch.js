// Multi-touch for the drawing canvases (phones / tablets):
//  - one finger: the active tool (the press is held back briefly so a second finger can still turn
//    it into a gesture without placing or selecting anything)
//  - two fingers: pinch to zoom, drag to pan
//  - long press without moving: acts as the right mouse button (end a wire / wall chain, stop a tool)
// Mouse and pen input pass through unchanged.

const HOLD_MS = 120; // wait for a second finger before starting the tool
const LONG_MS = 550; // long press → right click
const MOVE_TOL = 8; // px before a press counts as a drag

export function attachTouch(svg, editor) {
  const touches = new Map(); // pointerId → {x, y}
  let pending = null; // buffered first press {e, timer, long, x, y}
  let forwarding = null; // pointerId whose events go to the editor
  let gesture = null; // {dist, mx, my}
  let swallow = false; // ignore the remaining finger after a gesture / long press

  const fake = (e, extra = {}) => ({
    clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, target: e.target, button: 0,
    shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, pointerType: 'touch', preventDefault() {}, ...extra,
  });

  const startForwarding = () => {
    if (!pending) return;
    clearTimeout(pending.timer);
    forwarding = pending.e.pointerId;
    editor.onDown(fake(pending.e));
    pending.started = true;
  };

  const beginGesture = () => {
    if (pending) { clearTimeout(pending.timer); clearTimeout(pending.long); pending = null; }
    if (forwarding !== null) { editor.cancelInteraction?.(); forwarding = null; }
    const [a, b] = [...touches.values()];
    gesture = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (touches.size >= 2) { beginGesture(); return; }
    swallow = false;
    pending = { e, x: e.clientX, y: e.clientY };
    pending.timer = setTimeout(startForwarding, HOLD_MS);
    pending.long = setTimeout(() => {
      // long press without moving → right click
      if (!pending || touches.size !== 1) return;
      if (pending.started) editor.cancelInteraction?.();
      editor.onDown(fake(pending.e, { button: 2 }));
      navigator.vibrate?.(15);
      pending = null;
      forwarding = null;
      swallow = true;
    }, LONG_MS);
  }, true);

  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') return;
    e.stopImmediatePropagation();
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // pan with the midpoint, zoom around it
      editor.view.x -= (mx - gesture.mx) * editor.view.s;
      editor.view.y -= (my - gesture.my) * editor.view.s;
      if (gesture.dist > 0 && dist > 0) editor.zoomAt(gesture.dist / dist, mx, my);
      else editor.applyView();
      gesture = { dist, mx, my };
      return;
    }
    if (swallow) return;
    if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > MOVE_TOL) {
      clearTimeout(pending.long);
      if (!pending.started) startForwarding();
    }
    if (forwarding === e.pointerId) editor.onMove(fake(e));
  }, true);

  const end = (e) => {
    if (e.pointerType !== 'touch') return;
    e.stopImmediatePropagation();
    touches.delete(e.pointerId);
    if (gesture) {
      if (touches.size < 2) { gesture = null; swallow = touches.size > 0; }
      return;
    }
    if (swallow) { if (!touches.size) swallow = false; return; }
    if (pending) {
      clearTimeout(pending.long);
      if (!pending.started) startForwarding(); // a quick tap
      pending = null;
    }
    if (forwarding === e.pointerId) {
      editor.onUp(fake(e));
      forwarding = null;
    }
  };
  svg.addEventListener('pointerup', end, true);
  svg.addEventListener('pointercancel', end, true);
}
