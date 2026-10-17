// Modal dialogs.
import { h } from '../util.js';

/**
 * Shows a modal. `buttons`: [{label, value, primary?, danger?}]. Resolves with the clicked value
 * (undefined when closed). `onButton(value)` may return false to keep the dialog open.
 */
export function modal({ title, body, buttons = [{ label: 'Sluiten', value: undefined }], wide = false, full = false, cls = '', onButton, onClose }) {
  return new Promise((resolve) => {
    const close = (v) => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      onClose?.();
      resolve(v);
    };
    const onKey = (e) => {
      if ([...document.querySelectorAll('.modal-back')].pop() !== back) return; // only the topmost dialog
      if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && buttons.some((b) => b.primary)) {
        e.preventDefault();
        click(buttons.find((b) => b.primary).value);
      }
    };
    const click = async (v) => {
      if (onButton && (await onButton(v)) === false) return;
      close(v);
    };
    const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back && !full) close(undefined); } },
      h('div', { class: 'modal' + (wide ? ' wide' : '') + (full ? ' full' : '') + (cls ? ' ' + cls : '') },
        h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon', title: 'Sluiten', onclick: () => close(undefined) }, '✕')),
        h('div', { class: 'modal-body' }, body),
        buttons.length ? h('div', { class: 'modal-foot' }, buttons.map((b) =>
          h('button', { class: (b.primary ? 'primary' : '') + (b.danger ? ' danger' : ''), onclick: () => click(b.value) }, b.label))) : null));
    document.body.append(back);
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => {
      const f = back.querySelector('input,textarea,select');
      f?.focus();
      if (f && (f.tagName === 'TEXTAREA' || f.type === 'text')) f.select();
    }, 30);
  });
}

export async function prompt(title, value = '', { multiline = false, label = '' } = {}) {
  const input = multiline ? h('textarea', { rows: 4, value }) : h('input', { type: 'text', value });
  const v = await modal({
    title,
    body: h('label', { class: 'field' }, label ? h('span', null, label) : null, input),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'OK', value: true, primary: true }],
  });
  return v ? input.value : null;
}

export async function confirmDlg(title, text, okLabel = 'OK', danger = false) {
  return !!(await modal({
    title,
    body: h('p', null, text),
    buttons: [{ label: 'Annuleren', value: false }, { label: okLabel, value: true, primary: !danger, danger }],
  }));
}

export const alertDlg = (title, text) => modal({ title, body: h('p', null, text), buttons: [{ label: 'OK', value: true, primary: true }] });

let toastTimer;
export function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) document.body.append((el = h('div', { class: 'toast' })));
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/** Form field helpers. */
export const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
