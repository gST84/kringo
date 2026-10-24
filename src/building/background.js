// Background drawing of a floor plan: an image or one page of a PDF, traced over and set to scale.
// A PDF is rendered once to an image with pdf.js, which is loaded from the CDN only when needed.
import { t } from '../i18n.js';
import { uid } from '../util.js';
import { FRAME } from '../model.js';
import { prompt, toast } from '../ui/dialogs.js';
import { planK } from './render.js';

const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
const MAX_PX = 4000; // longest side of the stored image

const pickFile = () => new Promise((resolve) => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,application/pdf,.pdf' });
  input.addEventListener('change', () => resolve(input.files[0] || null));
  input.click();
});

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(t('Afbeelding kan niet gelezen worden')));
  img.src = src;
});

/** Draws a source (image / canvas) on a white canvas of at most MAX_PX and returns a JPEG data URL. */
function toDataUrl(src, w, h) {
  const f = Math.min(1, MAX_PX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * f); c.height = Math.round(h * f);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(src, 0, 0, c.width, c.height);
  return { data: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
}

async function renderPdf(file) {
  let pdfjs;
  try {
    pdfjs = await import(PDFJS);
  } catch {
    throw new Error(t('De PDF-lezer kon niet geladen worden (internetverbinding nodig).'));
  }
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let pageNo = 1;
  if (doc.numPages > 1) {
    const v = await prompt('Pagina', '1', { label: t('De PDF heeft {n} pagina\'s.', { n: doc.numPages }) });
    if (v === null) return null;
    pageNo = Math.max(1, Math.min(doc.numPages, parseInt(v, 10) || 1));
  }
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 }); // PDF points (1/72 inch)
  const scale = Math.min(MAX_PX / Math.max(base.width, base.height), 8);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  const out = toDataUrl(c, c.width, c.height);
  out.mmW = (base.width / 72) * 25.4; // paper width of the PDF page
  return out;
}

/** Asks for an image / PDF and makes it the background of the current floor. */
export async function loadBackground(app) {
  const file = await pickFile();
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let img;
  try {
    if (isPdf) {
      toast(t('PDF wordt geladen…'));
      img = await renderPdf(file);
      if (!img) return;
    } else {
      const url = URL.createObjectURL(file);
      try {
        const el = await loadImage(url);
        img = toDataUrl(el, el.naturalWidth, el.naturalHeight);
      } finally { URL.revokeObjectURL(url); }
    }
  } catch (e) {
    toast(e.message || String(e));
    return;
  }
  const b = app.project.building;
  const k = planK(b);
  const aspect = img.h / img.w;
  // fit in the drawing area; a PDF with a known scale gets its real size
  const areaW = (FRAME.area.x1 - FRAME.area.x0 - 20) / k, areaH = (FRAME.area.y1 - FRAME.area.y0 - 20) / k;
  let w = Math.min(areaW, areaH / aspect);
  let scaled = false;
  if (isPdf && img.mmW) {
    const v = await prompt('Schaal van de PDF  1:', '', { label: t('bv. 50 voor 1:50 – leeg laten om de schaal daarna met twee punten te bepalen') });
    const n = parseFloat(String(v || '').replace(',', '.'));
    if (n > 0) { w = (img.mmW * n) / 10; scaled = true; }
  }
  const id = uid('img');
  app.project.images[id] = img.data;
  app.mutate(() => {
    app.floor.bg = { img: id, name: file.name, x: 0, y: 0, w: Math.round(w * 10) / 10, h: Math.round(w * aspect * 10) / 10, opacity: 0.5, locked: false, print: false };
  });
  app.select(['B:bg']);
  toast(scaled ? t('Achtergrond geladen.') : t('Achtergrond geladen – bepaal nu de schaal: klik twee punten met een gekende afstand.'));
  if (!scaled) app.plan.setTool('calib');
}
