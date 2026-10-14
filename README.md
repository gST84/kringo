# ElecAD

CAD-programma in de browser voor elektrische schema's. Geen installatie en geen build-stap: plain JavaScript (ES-modules) + SVG.

## Starten

**Online, zonder installatie:** <https://gst84.github.io/elecad/> (Chrome of Edge, ook op Windows).

Lokaal draaien:

ES-modules werken niet via `file://`, dus er is een kleine lokale webserver nodig (Python 3 zit standaard op macOS):

```bash
./start.command
```

of `python3 serve.py` en open daarna <http://localhost:8765>. Gebruik bij voorkeur Chrome of Edge: alleen die ondersteunen het koppelen van een symbolenmap op schijf.

Omdat het een statische site is, kan de map ook op elke webserver of GitHub Pages gezet worden.

## Modi

| Modus | Status |
|---|---|
| **Stuurkasten** – industriële schema's | eerste versie (dit) |
| **Gebouwen** – grondplan + AREI-symbolen + ééndraadschema | volgende fase |

## Stuurkasten

- **Pagina's** op A3 liggend met kader, kolommen (1–10) en rijen (A–F), titelblok met bedrijf, logo, project, tekenaar, datum, revisie, paginatitel en bladnummer.
- **Voedingslijnen** boven en onder (L1 L2 L3 N PE, L/N, +24V/0V …). Lijnen met dezelfde naam zijn op alle pagina's hetzelfde potentiaal.
- **Symbolenbibliotheek** (IEC 60617-stijl) in mappen: contactoren & relais, beveiliging, bediening, signalisatie & belasting, voeding, klemmen & verwijzingen, PLC (kaarten met instelbaar aantal kanalen + losse I/O-punten), sensoren, passief.
- **Draden** tekenen met automatische haakse knik; eindigen vanzelf op een pin, draad of voedingslijn. Bij verslepen van symbolen rekken aangesloten draden mee. Verbindingspunten (T) krijgen automatisch een bolletje, open pinnen een rood rondje.
- **Componentnummering** volgens pagina / kolom / rij, instelbaar formaat (`-{page}{prefix}{col}` → `-2K4`, `-{prefix}{n}` → `-K1` …) + hernummeren.
- **Draadnummering** per potentiaal, instelbaar formaat; voedingslijnen geven hun naam door; manueel overschrijven kan.
- **Koppelen** van contacten, PLC-punten … aan een toestel (spoel, drukknop, PLC-kaart …): ze delen de tag, krijgen een kruisverwijzing (`/2.4`) en automatische contactnummers (13-14, 21-22 …); onder spoelen verschijnt een contactspiegel.
- **Klemmen** met strook en nummer, automatische nummering per strook.
- **Onderbrekingspunten**: zelfde naam = zelfde potentiaal, met verwijzing naar de andere plaatsen.
- **Lijsten**: toestellen, klemmen (boven/onder), draden (van → naar, kleur, doorsnede), PLC-adressen – CSV-export en afdrukken. Klik op een regel om naar het symbool te springen.
- **Symbooleditor**: zelf symbolen tekenen (lijn, polylijn, rechthoek, cirkel, boog, tekst met `{tag}` / `{desc}` …, pinnen, tagpositie), opslaan in eigen mappen.
- **Symbolen importeren / exporteren**: losse `.elsym`-bestanden, een bibliotheek-`.json`, een hele map importeren, of (Chrome / Edge) een **map op schijf koppelen**: symbolen in die map en submappen verschijnen in de bibliotheek, nieuwe symbolen worden er als `.elsym` in bewaard.
- **Projecten** worden automatisch in de browser bewaard (IndexedDB) en kunnen als `.elecad`-bestand opgeslagen en geopend worden. Eigen symbolen die in een project gebruikt worden, reizen mee in het bestand.
- **QElectroTech importeren**: "Open bestand" opent ook `.qet`-projecten. Folio's worden pagina's (met hun eigen kolom/rij-indeling), elementen worden projectsymbolen (map *QElectroTech*), draden, draadnummers, teksten, spoel/contact-koppelingen en folioverwijzingen worden overgenomen.
- **Afdrukken / PDF** (A3 liggend, alle of één pagina) en SVG-export per pagina.
- Ongedaan maken / opnieuw, kopiëren / plakken / dupliceren, pagina's dupliceren en herschikken.

### Sneltoetsen

`V` selecteren · `W` draad · `T` tekst · `B` kader · `H` pannen · `R` draaien · `M` spiegelen · `Del` verwijderen · `Ctrl+C / X / V / D` · `Ctrl+Z / Y` · `Ctrl+A` · `F` passend · pijltjes verschuiven · `PgUp / PgDn` pagina · spatie + slepen of middelste muisknop: pannen · scrollwiel / pinch: zoomen · `Alt`: zonder raster.

## Bestandsformaten

- Project: `*.elecad` – JSON `{ "format": "elecad-project", "version": 1, … }`
- Symbool: `*.elsym` – JSON `{ "format": "elecad-symbol", "version": 1, "symbol": { … } }`
- Bibliotheek: JSON `{ "format": "elecad-library", "version": 1, "symbols": [ … ] }`

Coördinaten zijn millimeters; pinnen van symbolen liggen op een raster van 5 mm.

## Code

```
index.html, styles.css, serve.py, start.command
src/
  main.js                 opbouw UI en events
  app.js                  toestand, undo/redo, autosave
  model.js                projectmodel, kader, paginasjablonen
  storage.js              IndexedDB
  demo.js                 voorbeeldproject (motorstarter)
  symbols/builtin.js      ingebouwde symbolen
  symbols/geom.js         geometrie, transformaties
  symbols/library.js      bibliotheek: ingebouwd + eigen + gekoppelde map
  schematic/analyze.js    verbindingen (netten), tags, kruisverwijzingen, draadnummers
  schematic/tags.js       nummering toestellen / klemmen / contacten
  schematic/render.js     SVG van pagina's en symbolen
  schematic/editor.js     tekenvlak en gereedschappen
  ui/                     panelen, dialogen, lijsten, symbooleditor
```
