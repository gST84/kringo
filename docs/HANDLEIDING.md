# Handleiding Kringo

Kringo tekent elektrische installaties in de browser: **gebouwen** (plattegronden, AREI-symbolen, kringen en het eendraadschema) en **stuurkasten** (industriële schema's). Deze handleiding legt uit hoe je werkt, met uitgewerkte voorbeelden.

**Inhoud**

1. [Starten](#1-starten)
2. [Het scherm](#2-het-scherm)
3. [Gebouw: het grondplan tekenen](#3-gebouw-het-grondplan-tekenen)
4. [Gebouw: symbolen, kringen en koppelingen](#4-gebouw-symbolen-kringen-en-koppelingen)
5. [Het eendraadschema](#5-het-eendraadschema)
6. [Voorbeelden](#6-voorbeelden)
   - [A. Schakelaar met lampen (wisselschakeling)](#a-schakelaar-met-lampen-wisselschakeling)
   - [B. Ledstrip](#b-ledstrip)
   - [C. Zonnepanelen met omvormer](#c-zonnepanelen-met-omvormer)
   - [D. Zonnepanelen met DC-busbar, MPPT's en batterij](#d-zonnepanelen-met-dc-busbar-mppts-en-batterij)
   - [E. Domotica](#e-domotica)
   - [F. Een bestaand plan overtekenen (PDF als achtergrond)](#f-een-bestaand-plan-overtekenen-pdf-als-achtergrond)
7. [Stuurkast](#7-stuurkast)
8. [Bewaren, openen, afdrukken](#8-bewaren-openen-afdrukken)
9. [Sneltoetsen](#9-sneltoetsen)

---

## 1. Starten

- **Online:** <https://gst84.github.io/kringo/> (Chrome, Edge of Safari).
- **Als app:** in Chrome / Edge op *Installeren* in de adresbalk; op iPad / iPhone in Safari via deelknop → *Zet op beginscherm*. Daarna werkt Kringo ook zonder internet.
- Bij het openen verschijnt het **welkomscherm**: kies de taal (Nederlands, Français, English), maak een **nieuw project** of open een recent project.

Bij een nieuw project kies je de soort: **Gebouw** of **Stuurkast**. Die ligt daarna vast.

## 2. Het scherm

| Plaats | Wat |
|---|---|
| Bovenaan | Icoontjes: nieuw, openen, bewaren als bestand, bestand openen, afdrukken / PDF. Daarnaast *Gegevens*, *Kringen*, *Domotica*, *Eendraadschema*, ongedaan maken / opnieuw. Rechts de taal en ♥ Steun. |
| Werkbalk | Selecteren (muispijl), pannen, muurtype, actieve kring, draaien, zoomen, raster, en de **paginakeuze** met *Plattegronden* en *Eendraadschema* in één lijst. |
| Links | **Symbolen** (met de tekentools onder *Grondplan* en *Aantekeningen*) en **Bladen** (verdiepingen en eendraadbladen). |
| Rechts | **Eigenschappen** van wat geselecteerd is; zonder selectie die van de verdieping. |

Algemeen: klik = selecteren, Shift + klik = erbij selecteren, slepen = verplaatsen, dubbelklik = eigenschappen of tekst bewerken, scrollwiel = zoomen, spatie + slepen of middelste muisknop = pannen. **Enter** bevestigt in elk venster, **Esc** stopt een tool.

## 3. Gebouw: het grondplan tekenen

Alle tekentools staan links onder **Grondplan**.

### Muren

- **Muur** (`W`): klik punt na punt. Typ een lengte in cm en druk Enter voor een exacte maat. Klik op het beginpunt (of dubbelklik / Esc) om te stoppen. Kies vooraf het muurtype in de werkbalk (buitenmuur 30 / 40, binnenmuur 14 / 10, scheidingswand 7).
- **Gebogen muur** (`A`): klik het beginpunt, het eindpunt en dan een punt op de boog.
- Een geselecteerde muur heeft blauwe bolletjes: de **eindpunten** verlengen de muur (aansluitende muren schuiven mee), het **middelste** bolletje buigt hem. *Recht maken* in de eigenschappen maakt hem terug recht.
- Muren die in een hoek samenkomen sluiten vanzelf netjes aan (verstek), ook tussen gebogen en rechte muren.

### Deuren, ramen en poorten

- Kies **Deur**, **Deuropening** (zonder deurblad), **Dubbele deur**, **Raam**, **Schuifraam / -deur** of **Garagepoort** en klik op een muur. De kant waar je muis staat bepaalt de draairichting.
- Verslepen schuift de opening langs de muur; de **blauwe bolletjes aan de uiteinden** maken ze breder of smaller.
- In de eigenschappen: type, breedte, hoogte, draairichting, scharnierzijde en *Zonder deurblad*.

### Trappen

- **Trap** en **Kwartdraaitrap**: sleep een rechthoek (of klik voor een standaardmaat). **Wenteltrap**: sleep vanuit het midden.
- Bolletjes aan de rand maken de trap groter of kleiner; de **draaischijf** in de eigenschappen draait hem rond zijn midden (sleep de wijzer, per 15°; Shift = per graad).

### Maten, vlakken en aantekeningen

- **Maatlijn** (`M`): klik twee punten (Kringo vangt muurhoeken en deurstijlen), dan de plaats van de maatlijn.
- **Gekleurd vlak**: klik de hoekpunten, klik het eerste punt of dubbelklik om te sluiten. Je ziet de oppervlakte in m².
- **Lijn**, **Pijl**, **Dubbele pijl**: klik de punten, dubbelklik of Enter = einde.
- **Tekstballon**: klik het punt waarnaar hij wijst, dan de plaats van de ballon, typ de tekst. **Tekstvak**: één klik.
- **Ruimtenaam** (`T`): klik in een ruimte en typ de naam.

### Achtergrond

Zie [voorbeeld F](#f-een-bestaand-plan-overtekenen-pdf-als-achtergrond).

## 4. Gebouw: symbolen, kringen en koppelingen

### Kringen en verdeelborden

Open **Kringen** bovenaan. Je bouwt er de boom: *verdeelbord → differentieel → kringen*, met differentiëlen achter differentiëlen en onderverdeelborden. Per kring stel je in: automaat of smeltzekering, curve, In, polen, Icn, kabel, brandklasse, aders, doorsnede, plaatsing en of de geleiders getekend worden.

### Symbolen plaatsen

- Kies in de werkbalk de **actieve kring** (bv. *Kring A*). Nieuwe symbolen komen in die kring en krijgen een volgnummer: A1, A2 …
- Klik een symbool in het paneel en klik op het plan (of sleep het naar het plan). Wandsymbolen draaien vanzelf tegen de dichtstbijzijnde muur; `Alt` = vrij plaatsen.
- In de eigenschappen: kring, volgnummer, ruimte, omschrijving, montagehoogte, vermogen …

### Koppelen

**Koppelen** (`L`): klik de symbolen na elkaar: 1 → 2 → 3 … Opnieuw klikken op een gekoppeld paar ontkoppelt. Koppelingen verschijnen als gekleurde stippellijnen (oranje = schakelen, paars = domotica, groen = PV / DC).

- **Gekoppelde symbolen krijgen dezelfde kring en hetzelfde nummer** (een schakelaar en zijn lampen worden allemaal bv. B1). Pas je de kring of het nummer van één symbool aan, dan volgt de hele groep. Uitzondering: domotica-koppelingen.
- Gekoppelde symbolen komen in het eendraadschema samen in één aftakking.

### AREI-controle

Zonder selectie toont het eigenschappenpaneel de opmerkingen van de AREI-controle (max. 8 stopcontacten per kring, doorsnede ↔ automaat, symbolen zonder kring …).

## 5. Het eendraadschema

Klik bovenaan op **Eendraadschema** en daarna op *Genereren* (of Enter). Per verdeelbord komt een blad in de Belgische opbouw: hoofdrail met voeding en aarding, differentiëlen met hun rail, per kring de automaat, kabel en genummerde aftakkingen.

- Het schema wordt **niet automatisch bijgewerkt**: genereer opnieuw na wijzigingen (eerder gegenereerde bladen worden vervangen).
- De bladen staan in de paginakeuze onder *Eendraadschema* en kunnen achteraf nog aangepast worden.

## 6. Voorbeelden

### A. Schakelaar met lampen (wisselschakeling)

Doel: een gang met twee wisselschakelaars die samen twee lichtpunten bedienen.

1. Open **Kringen** en maak (of kies) kring **B – Verlichting**, 16 A, 1,5 mm².
2. Kies in de werkbalk **Kring: B**.
3. Plaats bij elke deur een **Enkelpolige wisselschakelaar** (map *Schakelaars*) en in het plafond twee **Lichtpunten** (map *Verlichting*).
4. Kies **Koppelen** en klik: schakelaar 1 → lamp 1 → lamp 2 → schakelaar 2.
5. Alle vier krijgen hetzelfde nummer, bv. **B1**.
6. **Eendraadschema** → *Genereren*. In kring B staat één aftakking: wisselschakelaar – wisselschakelaar – lichtpunt **×2**.

> Tip: een kruisschakelaar komt tussen de twee wisselschakelaars: koppel hem gewoon mee in de ketting.

### B. Ledstrip

Doel: een ledstrip van 4,5 m onder een keukenkast, bediend met een schakelaar.

1. Kies kring **B** als actieve kring.
2. Klik in de map *Verlichting* op **LED-strip** en klik de punten van de strip op het plan. Het **eerste punt** (donker bolletje) is de voeding. Dubbelklik of Enter = einde.
3. In de eigenschappen zie je de **lengte** en het **vermogen**; vul *Vermogen per meter* (bv. 10 W/m) en de *Spanning* (24 V) in.
4. Plaats een schakelaar en **koppel** schakelaar → ledstrip.
5. In het eendraadschema: schakelaar → LED-strip in één aftakking.

### C. Zonnepanelen met omvormer

Doel: 10 panelen op één omvormer, op een eigen kring.

1. Maak in **Kringen** een kring **P – Zonnepanelen** (bv. 2P C 20 A, XVB 3G4²).
2. Plaats de **Omvormer** (map *Energie*) aan een muur en de **Zonnepanelen** op het dak. Eén paneelsymbool mag meerdere panelen voorstellen: zet *Aantal panelen* in de eigenschappen.
3. **Koppel**: omvormer → paneel 1 → paneel 2 → …
4. Vul bij de omvormer *Type / model*, *Serienummer* en *Vermogen (kW)* in, bij de panelen *Type*, *Piekvermogen (Wp)* en eventueel serienummers.
5. Klik op het plan op de omvormer: onder **Koppelingen** staat bij het eerste paneel een veld *kabeltype*: kies bv. **Solarkabel 6 mm²**.
6. Eendraadschema: één aftakking **omvormer → panelen ×10**, met de kabel boven de lijn en onder elk symbool de gegevens:

```
 P ─┬─ [~/=] ──── Solarkabel ──── [▦] x10
    │  Omvormer: SMA STP 5.0      PV: JA Solar JAM54S30
    │  5 kW                       10 × 410 Wp = 4,1 kWp
    │  SN 3010-123456
```

### D. Zonnepanelen met DC-busbar, MPPT's en batterij

Doel: een hybride installatie: een omvormer/lader, twee MPPT-laadregelaars met elk hun panelen en een thuisbatterij, allemaal op een DC-busbar.

**Op het plan**

1. Plaats in de technische ruimte: **Omvormer**, **DC-busbar**, twee keer **MPPT-laadregelaar** en de **Thuisbatterij** (map *Energie*); de **Zonnepanelen** op het dak.
2. **Koppel** (`L`) zo:
   - omvormer ↔ DC-busbar
   - MPPT 1 ↔ DC-busbar, MPPT 2 ↔ DC-busbar
   - batterij ↔ DC-busbar
   - MPPT 1 ↔ paneel 1 → paneel 2 → … (de panelen onderling in een ketting)
   - MPPT 2 ↔ zijn eigen panelen
3. Vul de gegevens in (eigenschappen rechts):
   - omvormer: type, serienummer, vermogen (kW)
   - MPPT: type, serienummer, vermogen (W) en/of max. laadstroom (A)
   - batterij: type, serienummer, capaciteit (kWh), vermogen (kW)
   - panelen: type, piekvermogen (Wp), serienummers
4. **Kabels**: klik een toestel aan en vul onder **Koppelingen** het *kabeltype* in (of klik op de groene stippellijn zelf):

   | Kabel | Op de koppeling | Bijvoorbeeld |
   |---|---|---|
   | omvormer → busbar | omvormer ↔ busbar | Accukabel 25 mm² |
   | busbar → MPPT | MPPT ↔ busbar | DC-kabel 10 mm² |
   | busbar → batterij | batterij ↔ busbar | Accukabel 25 mm² |
   | MPPT → panelen | MPPT ↔ eerste paneel | Solarkabel 6 mm² |

**In het eendraadschema** wordt dat één aftakking: de omvormer op de kringlijn, dan de verticale **DC**-busbar, met per toestel een rij. De MPPT met panelen komt bovenaan, de andere MPPT en de batterij parallel eronder:

```
 1 ─ [~/=] ── Accukabel ──┃── Accukabel ── [=/=] ── Solarkabel ── [▦] x4
     Omvormer: Victron    ┃                MPPT: SmartSolar        PV: JA Solar
     5 kW                 ┃                35 A                    4 × 450 Wp = 1,8 kWp
     SN HQ123456          ┃
                          ┃── DC-kabel ─── [=/=]
                          ┃                MPPT: SmartSolar 100/20
                          ┃
                          ┃── Accukabel ── [ = ]
                          DC               Batterij: Seplos
                                           32 kWh
```

### E. Domotica

In een domotica-installatie zitten de **modules (relais, dimmers, rolluikmodules) in het verdeelbord**; op het plan staan alleen de drukknoppen, sensoren en de verbruikers.

Doel: een woonkamer met twee lichtkringen op een schakelmodule, een gedimde ledstrip, een rolluik en twee domotica-drukknoppen.

1. **Modules aanmaken**: klik bovenaan op **Domotica**.
   - *＋ Schakelmodule* → **M1**, zet *Kanalen* op 8 (instelbaar van 1 tot 32), kies het *Bord* en de *Voeding* (de kring die de modules voedt, bv. kring D).
   - *＋ Dimmermodule* → **M2**, 4 kanalen.
   - *＋ Rolluikmodule* → **M3**, 3 kanalen.
   - *＋ Ingangsmodule* → **M4** voor de drukknoppen (optioneel).
2. **Verbruikers tekenen**: lichtpunten, ledstrip en de **Rolluik / screen (motor)** (map *Toestellen*), elk in hun kring (bv. B voor verlichting, R voor rolluiken).
3. **Kanalen toewijzen** – op twee manieren:
   - bij het symbool: eigenschappen → **Gestuurd door domotica** → kies bv. *M1.1*;
   - of centraal in het venster **Domotica**: bij een kanaal *＋ toewijzen…*.

   Meerdere lampen op hetzelfde kanaal mag. Op het plan verschijnt het adres in paars naast het symbool (bv. **M1.1**).
4. **Drukknoppen**: plaats **Domotica ingang (drukknop)**, **Domotica bewegingsmelder** of **Domotica aanwezigheidsmelder** (map *Domotica*). Kies eventueel bij *Domotica-ingang* een kanaal van de ingangsmodule (M4.1 …). **Koppel** de drukknop aan de lampen die hij bedient: dat is alleen informatie (welke knop wat stuurt); de kring wordt niet overgenomen, want drukknoppen zitten op de bus.

   | Kanaal | Stuurt | Bediening |
   |---|---|---|
   | M1.1 | B1 Lichtpunt ×2 – Living | M4.1 drukknop naast de deur |
   | M1.2 | B2 Inbouwspot ×6 – Living | M4.1, M4.2 |
   | M2.1 | B3 LED-strip – Keuken | M4.2 |
   | M3.1 | R1 Rolluik – Living | M4.3 |

5. **CSV exporteren** in het venster Domotica geeft deze lijst voor de programmeur.
6. **Eendraadschema**: in elke aftakking komt het **relaiscontact met zijn adres** vóór de verbruikers; de kring die de modules voedt krijgt een **modulevak** met hun namen. Drukknoppen komen niet in het 230 V-schema.

```
 B ─┬─ 1 ── [M1.1 ⌐] ── ✕ x2
    ├─ 2 ── [M1.2 ⌐] ── ⊗ x6
    └─ 3 ── [M2.1 ⌐] ── ▭▭▭ (LED-strip)

 D ─── 1 ── [▦] M1, M2, M3, M4
```

### F. Een bestaand plan overtekenen (PDF als achtergrond)

1. Kies onder *Grondplan* **Achtergrond (afbeelding / PDF)** en open het bestand (een PDF wordt eenmalig met internet omgezet; bij meerdere pagina's kies je de pagina).
2. Bij een PDF vraagt Kringo de **schaal** (bv. 50 voor 1:50): dan krijgt het plan meteen zijn echte maat. Laat leeg om de schaal zelf te bepalen.
3. **Schaal bepalen**: klik twee punten waarvan je de afstand kent (bv. de buitenmaat van een gevel) en geef de werkelijke afstand in cm.
4. Sleep de achtergrond op zijn plaats, zet de *Dekking* op 30–50 % en **vergrendel** hem.
5. Teken de muren erover. Kies *Mee afdrukken* als de achtergrond op de afdruk moet.

## 7. Stuurkast

- **Pagina's** op A3 met kolommen en rijen, titelblok met bedrijf en logo (*Gegevens*).
- **Voedingslijnen** (L1 L2 L3 N PE, +24V / 0V …) in de pagina-eigenschappen; zelfde naam = zelfde potentiaal over alle pagina's.
- **Draad** (`W`): klik op een pin, knikpunten, eindigt vanzelf op een pin, draad of voedingslijn.
- **Koppelen** van contacten aan een spoel of drukknop: gedeelde tag, kruisverwijzing (/2.4) en contactspiegel.
- **Lijsten**: toestellen, klemmen, draden, PLC – CSV en afdrukken.
- **Symbooleditor** voor eigen symbolen; symbolen importeren / exporteren of een map op schijf koppelen.
- **QElectroTech**: *Open bestand* opent ook `.qet`-projecten.

## 8. Bewaren, openen, afdrukken

- Projecten worden **automatisch** in de browser bewaard.
- **Bewaar bestand** (diskette) maakt een `.kringo`-bestand om door te sturen of als back-up; **Open bestand** opent `.kringo` en `.qet`.
- **Afdrukken / PDF** (printer): kies alles, alle plattegronden, de huidige plattegrond of het eendraadschema; kies in het afdrukvenster *Opslaan als PDF* en zet de marges op *Geen*. Alles op A3 liggend, plattegronden op schaal.

## 9. Sneltoetsen

**Grondplan:** `W` muur · `A` gebogen muur · `D` deur · `N` raam · `M` maatlijn · `T` ruimtenaam · `L` koppelen · `R` draaien · `V` selecteren · `H` pannen · `Del` verwijderen · `Ctrl+D` dupliceren · `Ctrl+Z / Y` ongedaan / opnieuw · `F` passend · `Alt` zonder raster / niet tegen de muur · `Backspace` laatste punt terug (vlak, lijn, ledstrip).

**Stuurkast:** `V` selecteren · `W` draad · `T` tekst · `B` kader · `R` draaien · `M` spiegelen · `Ctrl+C / X / V / D` · `Ctrl+Z / Y` · `F` passend · `PgUp / PgDn` pagina.

**Tablet:** knijpen = zoomen, twee vingers = verschuiven, lang drukken = rechtermuisknop.
