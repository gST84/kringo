// Simulation controls in the sheet toolbar: start / pause / stop, speed; runs the clock and redraws.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { Simulation } from './engine.js';

export function simControls(app, editor) {
  let timer = null;
  let last = 0;
  let paused = false;
  let speed = 1;
  const startBtn = h('button', { class: 'simstart', title: 'Schema simuleren: klik op drukknoppen en ventielen (Shift = vasthouden) · Esc = stoppen', onclick: () => start() }, '▶ ' + t('Simuleren'));
  const pauseBtn = h('button', { title: 'Pauzeren / verder', onclick: () => { paused = !paused; pauseBtn.textContent = paused ? '▶' : '⏸'; } }, '⏸');
  const stepBtn = h('button', { title: 'Terug naar de beginstand', onclick: () => { stop(); start(); } }, '⟲');
  const stopBtn = h('button', { class: 'simstop', title: 'Simulatie stoppen (Esc)', onclick: () => stop() }, '■ ' + t('Stop'));
  const speedSel = h('select', { title: 'Snelheid', onchange: (e) => { speed = +e.target.value; } },
    [[0.25, '¼×'], [0.5, '½×'], [1, '1×'], [2, '2×'], [5, '5×'], [10, '10×']].map(([v, l]) => h('option', { value: v, selected: v === 1 }, l)));
  const clock = h('span', { class: 'simclock' });
  const running = h('span', { class: 'simrun' }, pauseBtn, stepBtn, speedSel, clock, stopBtn);

  const sync = () => {
    const on = !!app.sim;
    startBtn.hidden = on;
    running.hidden = !on;
    document.body.classList.toggle('simulating', on);
    if (!on && timer) { cancelAnimationFrame(timer); timer = null; }
  };
  const frame = (now) => {
    timer = requestAnimationFrame(frame);
    const sim = app.sim;
    if (!sim) return;
    // the first frame can carry a timestamp from before start(): never step backwards
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (paused) return;
    // small steps so fast cylinders do not jump over their marks
    const total = dt * speed;
    const n = Math.max(1, Math.ceil(total / 0.01));
    for (let i = 0; i < n; i++) sim.step(total / n);
    clock.textContent = `${sim.time.toFixed(1).replace('.', ',')} s${sim.short ? ' ⚠ ' + t('kortsluiting') : ''}`;
    editor.render();
  };
  function start() {
    if (app.sim) return;
    app.sel.clear();
    app.sim = new Simulation(app.project, app.lib, app.analysis());
    paused = false;
    pauseBtn.textContent = '⏸';
    last = performance.now();
    sync();
    editor.setTool('select');
    timer = requestAnimationFrame(frame);
    app.emit('sim');
    editor.render();
  }
  function stop() {
    if (!app.sim) return;
    app.sim = null;
    sync();
    app.emit('sim');
    editor.render();
  }
  app.on('simStop', stop);
  app.on('sim', sync);
  app.on('project', sync);
  sync();
  return h('span', { class: 'simctl' }, startBtn, running);
}
