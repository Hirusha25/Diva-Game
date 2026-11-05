/**
 * Touch + keyboard input. Emits 'left' | 'right' | 'up' | 'tap'.
 * Swipes are recognised on pointer-up so a drag never fires twice.
 */
export class Controls {
  constructor(element, onAction) {
    this.onAction = onAction;
    this.enabled = true;
    this.start = null;
    const THRESHOLD = 28;

    element.addEventListener('pointerdown', (e) => {
      this.start = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    const end = (e) => {
      if (!this.start || !this.enabled) { this.start = null; return; }
      const dx = e.clientX - this.start.x;
      const dy = e.clientY - this.start.y;
      this.start = null;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return onAction('tap');
      if (Math.abs(dx) > Math.abs(dy)) onAction(dx > 0 ? 'right' : 'left');
      else if (dy < 0) onAction('up');
    };
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', () => { this.start = null; });

    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'up', Enter: 'tap' };
      const action = map[e.code];
      if (action) { e.preventDefault(); onAction(action); }
    });
  }
}
