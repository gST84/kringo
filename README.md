# Kringo

CAD-programma in de browser voor elektrische schema's. Geen installatie en geen build-stap: plain JavaScript (ES-modules) + SVG.

## Steun Kringo

Kringo is gratis. Wil je de verdere ontwikkeling steunen, dan kan dat via [Ko-fi](https://ko-fi.com/gst84). ♥

## Starten

**Online, zonder installatie:** <https://gst84.github.io/kringo/> (Chrome of Edge, ook op Windows).

**Als app installeren** (werkt daarna ook offline):

- Windows / Mac: Chrome of Edge → knop *Installeren* in de bovenbalk (of het installatie-icoon in de adresbalk). `.kringo`- en `.qet`-bestanden openen dan met een dubbelklik in Kringo.
- iPad / iPhone: Safari → deelknop → *Zet op beginscherm*. Belangrijk op iPad: alleen zo blijven projecten in de browser bewaard.
- Android: Chrome → *App installeren*.

Lokaal draaien:

ES-modules werken niet via `file://`, dus er is een kleine lokale webserver nodig (Python 3 zit standaard op macOS):

```bash
./start.command
```

of `python3 serve.py` en open daarna <http://localhost:8765>. Gebruik bij voorkeur Chrome of Edge: alleen die ondersteunen het koppelen van een symbolenmap op schijf.

Omdat het een statische site is, kan de map ook op elke webserver of GitHub Pages gezet worden.

## Soorten projecten

Bij **Nieuw** kies je de soort; die ligt daarna vast:

- **Gebouw** – plattegronden, AREI-symbolen, kringen en het eendraadschema (bladen in hetzelfde project).
- **Stuurkast** – industriële schema's.

## Gebouw

- **Plattegrond per verdieping** op schaal (1:50, 1:20, 1:75, 1:100) op A3: muren (buiten / binnen, dikte; klik punten of typ een lengte in cm + Enter), deuren, dubbele deuren, ramen, schuiframen (op een muur klikken, verslepen langs de muur), trappen en ruimtenamen.
- **AREI-symbolen**: lichtpunten, stopcontacten (enkel tot viervoudig, buiten, 3F), toestellen (wasmachine, droogkast, vaatwasser, kookplaat, oven, warmtepomp …), schakelaars (enkel-, tweepolig, wissel, kruis, dimmer, drukknop, bewegingsmelder), domotica (ingangen, uitgangen, dimmers, rolluiken), verdeelbord, meter, zonnepanelen, omvormer, thuisbatterij, laadpaal, rookmelder, data, TV … Wandsymbolen draaien vanzelf tegen de dichtstbijzijnde muur.
- **Kringen en verdeelborden als boom**: verdeelbord → differentieel → kringen, differentiëlen achter differentiëlen, onderverdeelborden gevoed door een kring of differentieel (elk met eigen eendraadbladen). Elk symbool krijgt een kring en volgnummer (A1, A2 …); per kring curve / smeltzekering, automaat, polen, Icn, kabel, brandklasse en doorsnede. Kies een *actieve kring* in de werkbalk om snel te plaatsen.
- **AREI-controle**: max. 8 stopcontacten per kring, min. 2,5 mm² en max. 20 A voor stopcontacten, automaat ↔ doorsnede, toestellen op een aparte kring, symbolen zonder kring …
- **Koppelen**: schakelaar → lichtpunten, domotica-ingang → uitgang, zonnepanelen → omvormer (gekleurde stippellijnen op het plan).
- **Eendraadschema** per verdeelbord in de Belgische opbouw: hoofdrail onderaan met voeding (kWh-meter, kabel, algemene differentieel) en aarding met meetklem; elke differentieel 30 mA op de hoofdrail met een eigen rail; per kring de automaat (kader "3000", "2P - C 20A"), kabel ("VOB Eca 3G2,5²") en genummerde aftakkingen: schakelaars op de lijn gevolgd door de gekoppelde lichtpunten (×n), stopcontactdozen, toestellen. Wordt gegenereerd als bladen in het gebouwproject (onder *Bladen*), achteraf aan te passen of zelf te tekenen met de map *AREI/Eendraad*.
- Symbolen draaien in stappen van 15° met de draaiknop in het eigenschappenpaneel.
- Plattegronden afdrukken / PDF of als SVG.

## Stuurkast

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
- **Symbolen importeren / exporteren**: losse `.ksym`-bestanden, een bibliotheek-`.json`, een hele map importeren, of (Chrome / Edge) een **map op schijf koppelen**: symbolen in die map en submappen verschijnen in de bibliotheek, nieuwe symbolen worden er als `.ksym` in bewaard.
- **Projecten** worden automatisch in de browser bewaard (IndexedDB) en kunnen als `.kringo`-bestand opgeslagen en geopend worden. Eigen symbolen die in een project gebruikt worden, reizen mee in het bestand.
- **QElectroTech importeren**: "Open bestand" opent ook `.qet`-projecten. Folio's worden pagina's (met hun eigen kolom/rij-indeling), elementen worden projectsymbolen (map *QElectroTech*), draden, draadnummers, teksten, spoel/contact-koppelingen en folioverwijzingen worden overgenomen.
- **Afdrukken / PDF** (A3 liggend, alle of één pagina) en SVG-export per pagina.
- Ongedaan maken / opnieuw, kopiëren / plakken / dupliceren, pagina's dupliceren en herschikken.

### Tablet / smartphone

Knijpen = zoomen, twee vingers slepen = verschuiven, één vinger = het gekozen gereedschap, lang drukken = rechtermuisknop (draad / muur beëindigen). Op smalle schermen zitten menu en zijpanelen achter knoppen (Menu, ☰, ⓘ).

### Sneltoetsen

`V` selecteren · `W` draad · `T` tekst · `B` kader · `H` pannen · `R` draaien · `M` spiegelen · `Del` verwijderen · `Ctrl+C / X / V / D` · `Ctrl+Z / Y` · `Ctrl+A` · `F` passend · pijltjes verschuiven · `PgUp / PgDn` pagina · spatie + slepen of middelste muisknop: pannen · scrollwiel / pinch: zoomen · `Alt`: zonder raster.

## Bestandsformaten

Bestanden van de vroegere naam ElecAD (`.elecad`, `.elsym`) blijven openen.

- Project: `*.kringo` – JSON `{ "format": "kringo-project", "version": 1, … }`
- Symbool: `*.ksym` – JSON `{ "format": "kringo-symbol", "version": 1, "symbol": { … } }`
- Bibliotheek: JSON `{ "format": "kringo-library", "version": 1, "symbols": [ … ] }`

Coördinaten zijn millimeters; pinnen van symbolen liggen op een raster van 5 mm.

## Code

```
index.html, styles.css, serve.py, start.command
tools/check.py          controle vóór een commit: offline-lijst in sw.js, imports (python3 tools/check.py)
manifest.webmanifest, sw.js, icons/   installeerbare app (PWA), offline cache
src/
  main.js                 opbouw UI en events
  pwa.js, touch.js        installeerbare app, aanraakgebaren
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
  ui/                     panelen, dialogen, startscherm, lijsten, symbooleditor
  building/               plattegronden, AREI-symbolen, kringen, AREI-controle, eendraadschema
```
