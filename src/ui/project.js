// Project dialogs: properties, settings, open / new, file import / export, printing.
import { demoCards } from './demos.js';
import { t } from '../i18n.js';
import { h, download, pickFiles, readDataURL, safeName, shrinkImage, uid } from '../util.js';
import { FORMAT, LEGACY_FORMATS, newProject, SHEET } from '../model.js';
import { deleteProject, listProjects, loadProject } from '../storage.js';
import { standalonePageSvg } from '../schematic/render.js';
import { renumberDevices, renumberTerminals } from '../schematic/tags.js';
import { alertDlg, confirmDlg, field, modal, toast } from './dialogs.js';
import { importQet } from '../import/qet.js';
import { standalonePlanSvg } from '../building/render.js';

export async function projectDialog(app) {
  const p = app.project;
  const m = p.meta;
  const v = {
    name: h('input', { value: p.name }),
    description: h('textarea', { rows: 2, value: m.description }),
    customer: h('input', { value: m.customer }),
    company: h('input', { value: m.company }),
    address: h('textarea', { rows: 3, value: m.address }),
    drawer: h('input', { value: m.drawer }),
    date: h('input', { type: 'date', value: m.date }),
    revision: h('input', { value: m.revision }),
  };
  let logo = m.logo;
  const logoImg = h('div', { class: 'logoprev' });
  const showLogo = () => logoImg.replaceChildren(logo ? h('img', { src: logo }) : h('span', null, 'Geen logo'));
  showLogo();
  const body = h('div', { class: 'form cols2' },
    h('div', null,
      h('h3', null, 'Project'),
      field('Projectnaam', v.name), field('Omschrijving', v.description), field('Klant', v.customer),
      h('div', { class: 'grid2' }, field('Datum', v.date), field('Revisie', v.revision)),
      field('Getekend door', v.drawer)),
    h('div', null,
      h('h3', null, 'Bedrijf'),
      field('Bedrijfsnaam', v.company), field('Adres / contact', v.address),
      field('Logo', h('div', null, logoImg,
        h('div', { class: 'btnrow' },
          h('button', {
            onclick: async () => {
              const [f] = await pickFiles({ accept: 'image/*' });
              if (f) { logo = await shrinkImage(await readDataURL(f)); showLogo(); }
            },
          }, 'Kiezen…'),
          h('button', { onclick: () => { logo = null; showLogo(); } }, 'Wissen'),
          h('button', {
            title: 'Bedrijfsgegevens + logo bewaren als standaard voor nieuwe projecten',
            onclick: () => {
              localStorage.setItem('elecad.company', JSON.stringify({ company: v.company.value, address: v.address.value, drawer: v.drawer.value, logo }));
              toast('Opgeslagen als standaard voor nieuwe projecten');
            },
          }, 'Als standaard'))))));
  const ok = await modal({
    title: 'Projectgegevens', wide: true, body,
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Opslaan', value: true, primary: true }],
  });
  if (!ok) return;
  app.mutate(() => {
    p.name = v.name.value;
    Object.assign(m, {
      description: v.description.value, customer: v.customer.value, company: v.company.value, address: v.address.value,
      drawer: v.drawer.value, date: v.date.value, revision: v.revision.value, logo,
    });
  });
  app.emit('project');
}

export async function settingsDialog(app) {
  const s = app.project.settings;
  const tagFmt = h('input', { value: s.tagFormat, list: 'tagfmts' });
  const wireFmt = h('input', { value: s.wireFormat, list: 'wirefmts' });
  const cols = h('input', { type: 'number', min: 4, max: 20, value: s.columns });
  const rows = h('input', { type: 'number', min: 2, max: 12, value: s.rows });
  const showW = h('input', { type: 'checkbox', checked: s.showWireNumbers !== false });
  const body = h('div', { class: 'form' },
    h('h3', null, 'Componentnummering'),
    field('Formaat', tagFmt, t('Tokens: {prefix} letter (K, S, Q …), {page} pagina, {col} kolom, {row} rij-letter, {n} volgnummer. Voorbeelden: -{page}{prefix}{col} → -2K4 · -{prefix}{page}.{col}{row} → -K2.4C · -{prefix}{n} → -K1')),
    h('datalist', { id: 'tagfmts' }, ['-{page}{prefix}{col}', '-{prefix}{page}.{col}', '-{prefix}{page}.{col}{row}', '-{prefix}{page}{col}{n}', '-{prefix}{n}'].map((x) => h('option', { value: x }))),
    h('h3', null, 'Draadnummering'),
    field('Formaat', wireFmt, t('Tokens: {page}, {col}, {row}, {n}. Voedingslijnen krijgen hun naam (L1, N, +24V …). Voorbeelden: {n} → 1, 2, 3 · {page}.{col}{n} → 2.41 · leeg = geen automatische nummers')),
    h('datalist', { id: 'wirefmts' }, ['{n}', '{page}.{col}', '{page}{col}{n}', '{page}.{col}.{n}'].map((x) => h('option', { value: x }))),
    h('label', { class: 'check' }, showW, 'Draadnummers tonen op het schema'),
    h('h3', null, 'Bladindeling'),
    h('div', { class: 'grid2' }, field('Kolommen', cols), field('Rijen', rows)));
  const r = await modal({
    title: 'Projectinstellingen', body,
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Opslaan', value: 'save' }, { label: 'Opslaan + hernummeren', value: 'renumber', primary: true }],
  });
  if (!r) return;
  app.mutate((p) => {
    p.settings.tagFormat = tagFmt.value || '-{prefix}{n}';
    p.settings.wireFormat = wireFmt.value.trim();
    p.settings.columns = Math.max(4, Math.min(20, +cols.value || 10));
    p.settings.rows = Math.max(2, Math.min(12, +rows.value || 6));
    p.settings.showWireNumbers = showW.checked;
    if (r === 'renumber') renumberDevices(p, app.lib);
  });
}

export async function renumberDialog(app) {
  const dev = h('input', { type: 'checkbox', checked: true });
  const term = h('input', { type: 'checkbox', checked: false });
  const ok = await modal({
    title: 'Hernummeren',
    body: h('div', { class: 'form' },
      h('label', { class: 'check' }, dev, 'Toestellen met automatische tag (volgens pagina / kolom)'),
      h('label', { class: 'check' }, term, 'Klemmen per strook (1 … n, in volgorde van pagina en positie)'),
      h('p', { class: 'hint' }, 'Gekoppelde contacten volgen hun toestel. Manueel ingevoerde tags blijven ongewijzigd.')),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'Hernummeren', value: true, primary: true }],
  });
  if (!ok) return;
  let n = 0;
  app.mutate((p) => {
    if (dev.checked) n = renumberDevices(p, app.lib);
    if (term.checked) renumberTerminals(p, app.lib);
  });
  toast(dev.checked ? `${n} tag(s) gewijzigd` : 'Klemmen hernummerd');
}

// ---------- open / new / files ----------

export function companyDefaults() {
  try { return JSON.parse(localStorage.getItem('elecad.company') || 'null') || {}; } catch { return {}; }
}

const KIND_LABEL = { building: '🏠 Gebouw', schematic: '🗄 Stuurkast', fluid: '💧 Hydraulica / pneumatica' };

export function createProject(name, kind = 'schematic') {
  const p = newProject(name, kind);
  const d = companyDefaults();
  Object.assign(p.meta, Object.fromEntries(Object.entries(d).filter(([, v]) => v)));
  return p;
}

export async function openDialog(app) {
  const body = h('div', { class: 'openlist' });
  let close;
  const render = (items) => body.replaceChildren(
    items.length ? h('table', { class: 'list' },
      h('thead', null, h('tr', null, h('th', null, 'Project'), h('th', null, 'Soort'), h('th', null, 'Klant'), h('th', null, 'Gewijzigd'), h('th', null, ''))),
      h('tbody', null, items.map((it) => h('tr', { class: it.id === app.project?.id ? 'current' : '' },
        h('td', null, h('button', { class: 'link', onclick: () => close(it.id) }, it.name)),
        h('td', null, KIND_LABEL[it.kind] || KIND_LABEL.schematic),
        h('td', null, it.customer || ''), h('td', null, new Date(it.updated).toLocaleString()),
        h('td', null, h('button', {
          class: 'icon danger', title: 'Verwijderen',
          onclick: async () => {
            if (it.id === app.project?.id) return toast('Het geopende project kan niet verwijderd worden.');
            if (!(await confirmDlg('Project verwijderen', t('"{name}" definitief verwijderen uit de browser?', { name: it.name }), 'Verwijderen', true))) return;
            await deleteProject(it.id);
            render(await listProjects());
          },
        }, '🗑')))))) : h('p', null, 'Nog geen projecten in deze browser.'));
  render(await listProjects());
  const demos = h('div', { class: 'opendemos' }, ...demoCards(app, (fn) => () => close(fn)));
  const result = await modal({
    title: 'Project openen', wide: true, body: h('div', null, demos, h('h3', null, 'In deze browser'), body),
    buttons: [{ label: 'Bestand openen…', value: 'file' }, { label: 'Sluiten', value: undefined }],
    bind: (c) => { close = c; },
  });
  if (typeof result === 'function') return result();
  if (result === 'file') return importProjectFile(app);
  if (result) {
    const p = await loadProject(result);
    if (p) app.setProject(p);
  }
}

export async function importProjectFile(app) {
  const [f] = await pickFiles({ accept: '.kringo,.elecad,.json,.qet' });
  if (f) await openProjectFile(app, f);
}

/** Opens a .kringo / .elecad project or imports a QElectroTech .qet file. */
export async function openProjectFile(app, f) {
  try {
    if (/\.qet$/i.test(f.name)) {
      const { project, report } = importQet(await f.text(), f.name);
      app.setProject(project);
      await app.save();
      alertDlg('QElectroTech geïmporteerd',
        t('{pages} pagina\'s, {comps} symbolen, {wires} draden', report) +
        (report.routed ? t(' ({n} draden zonder vast verloop opnieuw gerouteerd)', { n: report.routed }) : '') +
        (report.skipped ? t(', {n} elementen overgeslagen', { n: report.skipped }) : '') + '.');
      return;
    }
    const p = JSON.parse(await f.text());
    if ((p.format !== FORMAT && !LEGACY_FORMATS.includes(p.format)) || !Array.isArray(p.pages)) throw new Error('Geen Kringo-projectbestand.');
    p.format = FORMAT;
    const existing = await loadProject(p.id);
    if (existing && !(await confirmDlg('Project bestaat al', t('"{name}" staat al in deze browser. Overschrijven met het bestand? (Annuleren = als kopie openen)', { name: existing.name }), 'Overschrijven'))) {
      p.id = uid('prj');
      p.name += ' (kopie)';
    }
    app.setProject(p);
    await app.save();
    toast('Project geopend');
  } catch (e) {
    alertDlg('Openen mislukt', e.message);
  }
}

export async function exportProjectFile(app) {
  const p = app.project;
  p.symbols = app.lib.embedFor(p);
  const data = JSON.stringify(p);
  const name = safeName(p.name) + '.kringo';
  if (window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Kringo-project', accept: { 'application/json': ['.kringo'] } }] });
      const w = await fh.createWritable();
      await w.write(data);
      await w.close();
      toast('Project opgeslagen als bestand');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  download(name, data);
}

// ---------- print / SVG ----------

export function printProject(app, pages = null, floors = null) {
  const an = app.analysis();
  const root = document.getElementById('print-root');
  const p = app.project;
  const idx = pages || (floors ? [] : p.pages.map((_, i) => i));
  root.innerHTML = (floors || []).map((i) => `<div class="print-page">${standalonePlanSvg(p, i, app.lib)}</div>`).join('')
    + idx.map((i) => `<div class="print-page">${standalonePageSvg(p, p.pages[i], i, an)}</div>`).join('');
  const done = () => { root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

export function exportPageSvg(app) {
  const an = app.analysis();
  const p = app.project;
  download(`${safeName(p.name)} - blad ${app.pageIdx + 1}.svg`, standalonePageSvg(p, app.page, app.pageIdx, an), 'image/svg+xml');
}

export async function printDialog(app) {
  if (app.project.kind === 'building') return printPlansDialog(app);
  const all = h('input', { type: 'radio', name: 'pr', checked: true });
  const cur = h('input', { type: 'radio', name: 'pr' });
  const ok = await modal({
    title: 'Afdrukken / PDF',
    body: h('div', { class: 'form' },
      h('label', { class: 'check' }, all, t('Alle pagina\'s ({n})', { n: app.project.pages.length })),
      h('label', { class: 'check' }, cur, t('Huidige pagina ({n})', { n: app.pageIdx + 1 })),
      h('p', { class: 'hint' }, t('Formaat A3 liggend ({w} × {h} mm). Kies "Opslaan als PDF" in het afdrukvenster voor een PDF; zet marges op "Geen".', SHEET))),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'SVG van pagina', value: 'svg' }, { label: 'Afdrukken', value: 'print', primary: true }],
  });
  if (ok === 'svg') exportPageSvg(app);
  else if (ok === 'print') printProject(app, cur.checked ? [app.pageIdx] : null);
}

async function printPlansDialog(app) {
  const b = app.project.building;
  const sheets = app.project.pages.length;
  const opts = [
    ['all', t('Alles: plattegronden ({floors}) + eendraadschema ({sheets})', { floors: b.floors.length, sheets })],
    ['plans', t('Alle plattegronden ({n})', { n: b.floors.length })],
    ['floor', t('Huidige plattegrond ({name})', { name: app.floor.name })],
    ...(sheets ? [['sheets', t('Eendraadschema ({n} bladen)', { n: sheets })]] : []),
  ];
  const radios = opts.map(([v, l], i) => [v, h('input', { type: 'radio', name: 'pp', value: v, checked: i === 0 }), l]);
  const ok = await modal({
    title: 'Afdrukken / PDF',
    body: h('div', { class: 'form' },
      ...radios.map(([, r, l]) => h('label', { class: 'check' }, r, l)),
      h('p', { class: 'hint' }, t('A3 liggend, plattegronden op schaal 1:{scale}. Kies "Opslaan als PDF" in het afdrukvenster; marges op "Geen".', { scale: b.scale }))),
    buttons: [{ label: 'Annuleren', value: false }, { label: 'SVG van plattegrond', value: 'svg' }, { label: 'Afdrukken', value: 'print', primary: true }],
  });
  if (ok === 'svg') { download(`${safeName(app.project.name)} - ${safeName(app.floor.name)}.svg`, standalonePlanSvg(app.project, app.floorIdx, app.lib), 'image/svg+xml'); return; }
  if (ok !== 'print') return;
  const pick = radios.find(([, r]) => r.checked)[0];
  const floors = pick === 'all' || pick === 'plans' ? b.floors.map((_, i) => i) : pick === 'floor' ? [app.floorIdx] : [];
  const pages = pick === 'all' || pick === 'sheets' ? app.project.pages.map((_, i) => i) : [];
  printProject(app, pages, floors);
}
