// Kringo Besturing: control cabinets (electrical sheets) together with pneumatic / hydraulic sheets,
// simulated as one circuit.
import { boot } from '../shell.js';
import { FLUID } from '../fluid/symbols.js';
import { demoProject } from '../demo.js';
import { simControls } from '../sim/ui.js';
import { listsDialog } from '../ui/lists.js';
import { renumberDialog, settingsDialog } from '../ui/project.js';
import { isFluidPage } from '../model.js';
import { t } from '../i18n.js';
import { h } from '../util.js';

boot({
  kind: 'schematic',
  name: 'Kringo Besturing',
  newText: 'Stuurkasten (stuurstroom, vermogen, PLC, klemmen, lijsten) en pneumatische / hydraulische schema\'s (ISO 1219) – samen te simuleren.',
  fileText: '.kringo, .elecad of QElectroTech (.qet)',
  symbols: FLUID,
  demos: [{ icon: '⚙️', name: 'Besturing', text: 'Motorstarter, tijdrelais, PLC, elektropneumatiek, terugloop, tweehandbediening, hydraulisch heffen en pendelbeweging – met simulatie', make: demoProject }],
  initialProject: demoProject,
  menu: ({ app, btn }) => [
    btn('Instellingen', 'Nummering en bladindeling', () => settingsDialog(app)),
    btn('Hernummeren', 'Toestellen / klemmen hernummeren', () => renumberDialog(app)),
    btn('Lijsten', 'Toestellen-, klemmen-, draad- en PLC-lijst', () => listsDialog(app)),
  ],
  sheetTools: ({ app, editor }) => [h('span', { class: 'sep' }), simControls(app, editor)],
  // electrical and pneumatic / hydraulic sheets in separate groups
  pageOptions: ({ app }, pageOpts) => {
    const pages = app.project.pages;
    if (!pages.some(isFluidPage)) return null;
    const opts = pageOpts();
    const grp = (label, fluid) => {
      const o = opts.filter((_, i) => isFluidPage(pages[i]) === fluid);
      return o.length ? h('optgroup', { label: t(label) }, o) : null;
    };
    return [grp('Elektrisch', false), grp('Hydraulica / pneumatica', true)].filter(Boolean);
  },
});
