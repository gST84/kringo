# Handleiding Kringo

Kringo tekent elektrische installaties in de browser, met twee apps: **🏠 Kringo Gebouw** (plattegronden, AREI-symbolen, kringen en het eendraadschema) en **⚙️ Kringo Besturing**: stuurkasten (industriële schema's) samen met hydraulica en pneumatica (ISO 1219-schema's), die je samen kunt simuleren. Hoofdstukken 3–6 gaan over Gebouw, 7–9 over Besturing. Deze handleiding legt uit hoe je werkt, met uitgewerkte voorbeelden.

> **Voorbeeldproject:** alle schermafbeeldingen komen uit het project [*Woning Voorbeeldstraat 1*](voorbeelden/Woning%20Voorbeeldstraat%201.kringo) – download het en open het in Kringo met **Open bestand**. Je vindt er alle voorbeelden uit deze handleiding in terug.

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
   - [G. Ruimtes en uitwendige invloeden](#g-ruimtes-en-uitwendige-invloeden)
   - [H. Kabeltrace en kabellengtes](#h-kabeltrace-en-kabellengtes)
   - [I. Vloerverwarming](#i-vloerverwarming)
   - [J. Ventilatiedebieten](#j-ventilatiedebieten)
7. [Besturing: stuurkast](#7-besturing-stuurkast)
8. [Besturing: hydraulica en pneumatica](#8-besturing-hydraulica-en-pneumatica)
9. [Besturing: koelcircuits van machines](#9-besturing-koelcircuits-van-machines)
10. [Besturing: bouwblokken (sub-schema's)](#10-besturing-bouwblokken-sub-schemas)
11. [Bewaren, openen, afdrukken](#11-bewaren-openen-afdrukken)
12. [Sneltoetsen](#12-sneltoetsen)

---

## 1. Starten

- **Online:** <https://gst84.github.io/kringo/> toont de keuze tussen **Kringo Gebouw** en **Kringo Besturing**; daarna opent dat adres meteen de laatst gebruikte app. Rechtstreeks: <https://gst84.github.io/kringo/gebouw/> en <https://gst84.github.io/kringo/besturing/> (Chrome, Edge of Safari).
- **Andere app:** klik op het **Kringo-logo** linksboven, of op de link onderaan het welkomscherm.
- **Als app:** open de app en klik in Chrome / Edge op *Installeren* in de adresbalk; op iPad / iPhone in Safari via deelknop → *Zet op beginscherm*. Elke app installeer je apart; wie er één installeert, kan beide zonder internet gebruiken.
- Bij het openen verschijnt het **welkomscherm**: kies de taal (Nederlands, Français, English), maak een **nieuw project** of open een recent project van deze app.
- Onder **Demoproject** open je een uitgewerkt voorbeeld: in Gebouw een **woning** (verlichting, stopcontacten, zonnepanelen, domotica, data, ruimtes, kabeltrace en eendraadschema), in Besturing een **besturing** (motorstarter, tijdrelais, noodstop, PLC, een elektrisch gestuurde cilinder, vier pneumatische / hydraulische schakelingen en de koeling van een spindel met een chiller). Het staat ook bovenaan in het venster **Project openen**. Elke keer krijg je een nieuwe kopie, dus je kunt er vrij in werken.

Projecten worden in de browser bewaard; elke app toont alleen zijn eigen projecten. Open je een project van de andere soort (bv. een `.kringo`-bestand van een stuurkast in Kringo Gebouw), dan gaat het vanzelf open in de juiste app. Oudere projecten van de soort *Hydraulica / pneumatica* openen in Besturing, met enkel pneumatische en hydraulische bladen.

## 2. Het scherm

![Het scherm van Kringo met een plattegrond](img/overview.png)

| Plaats | Wat |
|---|---|
| Bovenaan | Icoontjes: nieuw, openen, bewaren als bestand, bestand openen, afdrukken / PDF. Daarnaast *Gegevens*, *Kringen*, *Domotica*, *Eendraadschema*, ongedaan maken / opnieuw. Rechts de taal en ♥ Steun. |
| Werkbalk | Selecteren (muispijl), pannen, muurtype, actieve kring, draaien, zoomen, raster, en de **paginakeuze** met *Plattegronden* en *Eendraadschema* in één lijst. |
| Links | **Symbolen** (met de tekentools onder *Grondplan* en *Aantekeningen*) en **Bladen** (verdiepingen en eendraadbladen). |
| Rechts | **Eigenschappen** van wat geselecteerd is; zonder selectie die van de verdieping. |

Algemeen: klik = selecteren, Shift + klik = erbij selecteren, slepen = verplaatsen, dubbelklik = eigenschappen of tekst bewerken, scrollwiel = zoomen, spatie + slepen of middelste muisknop = pannen. **Enter** bevestigt in elk venster, **Esc** stopt een tool.

## 3. Gebouw: het grondplan tekenen

### Plattegrond en installatieplannen

Een gebouw bestaat uit **plattegronden** (één per verdieping) en **installatieplannen** daarbovenop. Ze staan in het paneel links onder **Bladen**, gegroepeerd per type:

- **Plattegronden**: hier teken je het gebouw zelf – muren, deuren, ramen, trappen, ruimtes, ruimtenamen en de achtergrond. Er staan geen installatiesymbolen op.
- **⚡ Elektriciteit**, **🚰 Sanitair**, **♨ CV**, **≋ Vloerverwarming**, **🌀 Ventilatie** en **⤓ Afvoer**: met **＋ plan** maak je een plan van dat type op een plattegrond. Het grondplan staat er lichter en **vergrendeld** onder; je plaatst er enkel de symbolen, muurdoorvoeren, maatlijnen en aantekeningen van dat type. Wijzig je een muur op de plattegrond, dan volgen alle plannen.
- Het paneel **Symbolen** toont op elk plan enkel wat er past: op de plattegrond de tekentools, op een installatieplan de symbolen van dat type (op Elektriciteit de AREI-symbolen, op CV de ketel, collector, radiatoren …). De keuzelijst bovenaan en ◀ ▶ wisselen tussen de plannen van hetzelfde type.
- Op de plattegrond (niets geselecteerd) open of maak je de plannen van die verdieping met één klik. Op een installatieplan kun je het plan verwijderen (met zijn symbolen).
- Afdrukken: elk plan op een eigen blad, met het type in de titel (bv. *CV – Gelijkvloers*).

Oudere projecten krijgen vanzelf een Elektriciteit-plan per verdieping met symbolen.

Alle tekentools staan links onder **Grondplan** (op de plattegrond).

### Muren

- **Muur** (`W`): klik punt na punt. Typ een lengte in cm en druk Enter voor een exacte maat; wijst de muis binnen 5° van horizontaal, verticaal of 45°, dan loopt de muur precies in die richting. Een klik op minder dan 1 cm van het laatste punt stopt de muur (geen minimuurtjes). Klik op het beginpunt (of dubbelklik / Esc) om te stoppen. Kies vooraf het muurtype in de werkbalk (buitenmuur 30 / 40, binnenmuur 14 / 10, scheidingswand 7).
- **Gebogen muur** (`A`): klik het beginpunt, het eindpunt en dan een punt op de boog.
- Een geselecteerde muur heeft blauwe bolletjes: de **eindpunten** verlengen de muur (aansluitende muren schuiven mee, en binnenmuren die ertegen aansluiten blijven eraan vast), het **middelste** bolletje verschuift een rechte muur evenwijdig (hij blijft recht; aansluitende muren rekken mee). Met **Buigen** in de eigenschappen maak je er een gebogen muur van; bij een gebogen muur verandert het middelste bolletje de boog en maakt *Recht maken* hem terug recht. Typ je een **Lengte** in de eigenschappen, dan verlengt of verkort de muur vanaf zijn beginpunt en schuift de muur die op het eindpunt aansluit mee (de kamer wordt groter of kleiner); een muur in het verlengde wordt gewoon korter of langer. Op de plattegrond staan de maten van elke muur (hartlijn, in cm) in kleine afgeronde kadertjes op de muur, per stuk: van hoek tot hoek, tot een aansluitende muur en tot een deur of raam. Deuren en ramen krijgen hun breedte in een blauw kadertje. Zet dit uit met **Muurlengtes tonen** in het rechterpaneel; op papier en op de installatieplannen worden ze niet getoond (gebruik daar de Maatlijn).
- **Vergrendelingen (constraints)**, zoals in een CAD-programma. In de eigenschappen van een rechte muur kies je bij **Richting** *Horizontaal (H)*, *Verticaal (V)* of *Vaste hoek (∠)* met een hoek in graden, en met **Lengte vastzetten (↔)** ligt de lengte vast. Sleep je daarna een hoek, verschuif je een muur of typ je een lengte, dan past Kringo de rest van de plattegrond aan zodat alle vergrendelingen blijven kloppen: sleep je de hoek van een rechthoekige kamer, dan blijft ze rechthoekig. Kan het niet (bv. twee vaste lengtes die elkaar tegenspreken), dan blijft alles staan, kleurt de muur die in de weg zit even rood en zegt een melding welke vergrendeling het is.
  - Een paars label naast de muur toont de vergrendeling (H, V, ∠30°, ↔790); rood = niet meer voldaan. Een klik op het label selecteert de muur. Uitzetten met **Vergrendelingen tonen** in het paneel van de plattegrond.
  - Nieuwe muren die je horizontaal of verticaal tekent, worden meteen H of V vergrendeld (uit te zetten met **Nieuwe rechte muren automatisch H / V vergrendelen**).
  - **Rechte muren vergrendelen** (paneel van de plattegrond) vergrendelt in één keer alle muren die (bijna, tot 1°) horizontaal of verticaal staan en zet licht scheve muren recht – handig voor een bestaand plan.
  - Gebogen muren hebben geen vergrendelingen.
- Muren die in een hoek samenkomen sluiten vanzelf netjes aan (verstek), ook tussen gebogen en rechte muren.

### Deuren, ramen en poorten

- Kies **Deur**, **Deuropening** (zonder deurblad), **Dubbele deur**, **Raam**, **Schuifraam / -deur** of **Garagepoort** en klik op een muur. De kant waar je muis staat bepaalt de draairichting.
- Verslepen schuift de opening langs de muur; de **blauwe bolletjes aan de uiteinden** maken ze breder of smaller.
- In de eigenschappen: type, breedte, hoogte, draairichting, scharnierzijde en *Zonder deurblad*.
- **Muurdoorvoeren** (eigen groep in het paneel, op het installatieplan van dat type): een plaats waar leidingen door een muur mogen, per type een kleur: **CV** (rood), **sanitair** (blauw), **afvoer** (bruin), **ventilatie** (groen) en **kabels** (oranje). De muur blijft dicht; enkel leidingen van dat type gaan er bij het genereren door. Het type wijzig je in de eigenschappen. Een doorvoer voor kabels telt ook mee in de kabeltrace.

### Trappen

- **Trap** en **Kwartdraaitrap**: sleep een rechthoek (of klik voor een standaardmaat). **Wenteltrap**: sleep vanuit het midden.
- Bolletjes aan de rand maken de trap groter of kleiner; de **draaischijf** in de eigenschappen draait hem rond zijn midden (sleep de wijzer, per 15°; Shift = per graad).
- Een trap verschijnt vanzelf op de **verdieping erboven**, op dezelfde plaats: in **stippellijn**, zonder vulling en met de **pijl omgekeerd** (naar beneden). Dat is het trapgat; het volgt de trap eronder als je die verplaatst of wijzigt, en je selecteert of wijzigt hem op de verdieping waar de trap getekend is. Een trap van de 1ste verdieping komt zo op de 2de, enzovoort. Teken je op de bovenverdieping zelf een trap op dezelfde plaats, of staat de **Verbinding** van de trap op *Geen* of *Naar onder*, dan wordt hij niet herhaald.
- Bij het genereren van de vloerverwarming gaan de buizen rond de trap, niet eronder (ook bij een kwartdraai- of wenteltrap), en op de verdieping erboven rond het trapgat. Vink **Vloerverwarming eronder** aan in de eigenschappen als er toch buizen onder moeten.

### Kasten en aanrecht

- **Hoge kast** (rechthoek met een kruis) en **Aanrecht** (rechthoek met een diagonaal en een dubbele lijn aan de voorkant): sleep een rechthoek, of klik voor een standaardmaat (hoge kast 60 × 60 cm, aanrecht 240 × 60 cm).
- **Plat dak** en **Schuin dak**: sleep een rechthoek, of klik voor 400 × 300 cm. Een plat dak krijgt een lichte arcering, een pijl voor het afschot en de tekst *Plat dak* (of je eigen opschrift, bv. EPDM). Bij een schuin dak kies je de vorm: **zadeldak** (nok over de volle lengte), **schilddak** (kortere nok met hoeklijnen naar de hoeken) of **lessenaarsdak** (één helling naar de onderste zijde); de nok loopt langs de lange zijde en pijlen wijzen van de nok naar de dakgoot. Helling (°), afschot (%), maten en opschrift staan in de eigenschappen; draaien met R, de draaiknop of *Omdraaien*. Daken tellen niet als trap (geen trapgat op de volgende verdieping, geen ventilatie, geen blokkade voor vloerverwarming).
- In de eigenschappen: soort, lengte, diepte, een **opschrift** (bv. koelkast, oven, spoelbak), de draaischijf en **Omdraaien** (voorkant naar de andere kant). De blokjes aan de rand maken de kast langer of dieper; R draait 90°.
- Bij het genereren van de vloerverwarming komen er geen buizen onder kasten en aanrechten, tenzij je **Vloerverwarming eronder** aanvinkt.

### Maten, vlakken en aantekeningen

- **Maatlijn** (`M`): klik twee punten (Kringo vangt muurhoeken en deurstijlen), dan de plaats van de maatlijn.
- **Gekleurd vlak**: klik de hoekpunten, klik het eerste punt of dubbelklik om te sluiten. Je ziet de oppervlakte in m².
- **Lijn**, **Pijl**, **Dubbele pijl**: klik de punten, dubbelklik of Enter = einde.
- **Tekstballon**: klik het punt waarnaar hij wijst, dan de plaats van de ballon, typ de tekst. **Tekstvak**: één klik.
- **Ruimtenaam** (`T`): klik in een ruimte en typ de naam.

### Uitlijnen en verdelen

Selecteer twee of meer symbolen of ruimtenamen (Shift-klik of een rechthoek slepen). In de eigenschappen staat dan de rij **Uitlijnen**: links, op één verticale lijn, rechts, boven, op één horizontale lijn, onder, en **horizontaal / verticaal gelijk verdelen**. Bij verdelen blijven het eerste en het laatste element staan; vul je *Afstand bij verdelen* in, dan krijgen ze die vaste afstand vanaf het eerste (links / boven).

### Achtergrond

Zie [voorbeeld F](#f-een-bestaand-plan-overtekenen-pdf-als-achtergrond).

## 4. Gebouw: symbolen, kringen en koppelingen

### Kringen en verdeelborden

Open een plan **Elektriciteit** en klik bovenaan op **Kringen** (ook **Kringen & borden…** in het paneel van dat plan). De knoppen **Kringen**, **Domotica**, **Invloeden**, **Kabels** en **Eendraadschema** staan bovenaan enkel als een plan Elektriciteit open is, **Vloerverwarming** enkel op een vloerverwarmingsplan; zo blijft de balk rustig op de andere plannen. Je bouwt er de boom: *verdeelbord → differentieel → kringen*, met differentiëlen achter differentiëlen en onderverdeelborden. Per kring stel je in: automaat of smeltzekering, curve, In, polen, Icn, kabel, brandklasse, aders, doorsnede, plaatsing en of de geleiders getekend worden. Opmerkingen van de AREI-controle staan meteen bij de kring.

![Het venster Kringen & verdeelborden](img/circuits.png)

### Symbolen plaatsen

- Open het plan **Elektriciteit** van de verdieping (Bladen).
- Kies in de werkbalk de **actieve kring** (bv. *Kring A*). Nieuwe symbolen komen in die kring en krijgen een volgnummer: A1, A2 …
- Klik een symbool in het paneel en klik op het plan (of sleep het naar het plan). Wandsymbolen draaien vanzelf tegen de dichtstbijzijnde muur; `Alt` = vrij plaatsen.
- In de eigenschappen: kring, volgnummer, ruimte, omschrijving, montagehoogte, vermogen …
- **Stopcontact**: één symbool voor alle soorten. In de eigenschappen kies je het **aantal stopcontacten** in de doos (enkel tot 6×), **aarding**, **kinderbescherming** en een **opschrift** (IP44 voor buiten / natte ruimtes, 3F voor een krachtstopcontact, USB). Het symbool op het plan en in het eendraadschema past zich aan. Stopcontacten uit oudere projecten worden bij het openen omgezet.

### Koppelen

**Koppelen** (`L`): klik de symbolen na elkaar: 1 → 2 → 3 … Opnieuw klikken op een gekoppeld paar ontkoppelt. Koppelingen verschijnen als gekleurde stippellijnen (oranje = schakelen, paars = domotica, groen = PV / DC).

- **Gekoppelde symbolen krijgen dezelfde kring en hetzelfde nummer** (een schakelaar en zijn lampen worden allemaal bv. B1). Pas je de kring of het nummer van één symbool aan, dan volgt de hele groep. Uitzondering: domotica-koppelingen.
- Gekoppelde symbolen komen in het eendraadschema samen in één aftakking.

### AREI-controle

Zonder selectie toont het eigenschappenpaneel de opmerkingen van de AREI-controle (max. 8 stopcontacten per kring, doorsnede ↔ automaat, symbolen zonder kring …).

## 5. Het eendraadschema

Open een plan **Elektriciteit** en klik bovenaan op **Eendraadschema** (die knop staat er enkel op dat plan; ook in het paneel van het plan) en daarna op *Genereren* (of Enter). Per verdeelbord komt een blad in de Belgische opbouw: hoofdrail met voeding en aarding, differentiëlen met hun rail, per kring de automaat, kabel en genummerde aftakkingen.

- Het schema wordt **niet automatisch bijgewerkt**: genereer opnieuw na wijzigingen (eerder gegenereerde bladen worden vervangen).
- De bladen staan in de paginakeuze onder *Eendraadschema* en kunnen achteraf nog aangepast worden.

![Het eendraadschema van de voorbeeldwoning](img/eendraad.png)

## 6. Voorbeelden

### A. Schakelaar met lampen (wisselschakeling)

Doel: een gang met twee wisselschakelaars die samen twee lichtpunten bedienen.

1. Open **Kringen** en maak (of kies) kring **B – Verlichting**, 16 A, 1,5 mm².
2. Kies in de werkbalk **Kring: B**.
3. Plaats bij elke deur een **Enkelpolige wisselschakelaar** (map *Schakelaars*) en in het plafond twee **Lichtpunten** (map *Verlichting*).
4. Kies **Koppelen** en klik: schakelaar 1 → lamp 1 → lamp 2 → schakelaar 2.
5. Alle vier krijgen hetzelfde nummer, bv. **B1**. In de eigenschappen van een lamp zie je de koppelingen en de melding *Geldt voor alle gekoppelde symbolen*.

   ![Wisselschakeling in de living: gekoppelde schakelaars en lampen](img/switch.png)

6. **Eendraadschema** → *Genereren*. In kring B staat één aftakking (1): wisselschakelaar – wisselschakelaar – lichtpunt **x2** (zie de afbeelding bij [voorbeeld E](#e-domotica)).

> Tip: een kruisschakelaar komt tussen de twee wisselschakelaars: koppel hem gewoon mee in de ketting.

### B. Ledstrip

Doel: een ledstrip van 4,5 m onder een keukenkast, bediend met een schakelaar.

1. Kies kring **B** als actieve kring.
2. Klik in de map *Verlichting* op **LED-strip** en klik de punten van de strip op het plan. Het **eerste punt** (donker bolletje) is de voeding. Dubbelklik of Enter = einde.
3. In de eigenschappen zie je de **lengte** en het **vermogen**; vul *Vermogen per meter* (bv. 10 W/m) en de *Spanning* (24 V) in.
4. Plaats een schakelaar en **koppel** schakelaar → ledstrip.
5. In het eendraadschema: schakelaar → LED-strip in één aftakking.

![Een ledstrip in de keuken, met lengte, vermogen en domotica-kanaal](img/ledstrip.png)

In de voorbeeldwoning hangt de ledstrip niet aan een schakelaar maar aan domotica-kanaal **M2.1** (zie [voorbeeld E](#e-domotica)).

**RGB / RGBW**: kies bij *Type* **RGB** of **RGBW**. De leds op het plan kleuren dan rood, groen, blauw (en wit). Op domotica krijgt elke kleur een eigen **dimmerkanaal**: kies het kanaal voor rood en de andere kleuren krijgen automatisch de volgende vrije kanalen (aan te passen). In het eendraadschema staat het relaiscontact met het hele bereik, bv. **M2.1–4 RGBW**; in het venster Domotica zie je per kanaal de kleur (*LED-strip (Rood)* …).

![Een RGBW-ledstrip met een dimmerkanaal per kleur](img/ledstrip-rgbw.png)

### C. Zonnepanelen met omvormer

Doel: 10 panelen op één omvormer, op een eigen kring.

1. Maak in **Kringen** een kring **P – Zonnepanelen** (bv. 2P C 20 A, XVB 3G4²).
2. Plaats de **Omvormer** (map *Energie*) aan een muur en de **Zonnepanelen** op het dak. Eén paneelsymbool mag meerdere panelen voorstellen: zet *Aantal panelen* in de eigenschappen.
3. **Koppel**: omvormer → paneel 1 → paneel 2 → …
4. Vul bij de omvormer *Type / model*, *Serienummer* en *Vermogen (kW)* in, bij de panelen *Type*, *Piekvermogen (Wp)* en eventueel serienummers.
5. Klik op het plan op de omvormer: onder **Koppelingen** staat bij het eerste paneel een veld *kabeltype*: kies bv. **Solarkabel 6 mm²**.
6. Eendraadschema: één aftakking **omvormer → panelen x10**, met de kabel boven de lijn en onder elk symbool de gegevens – zoals in [voorbeeld D](#d-zonnepanelen-met-dc-busbar-mppts-en-batterij), maar zonder busbar.

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

![PV-installatie op het plan: omvormer, DC-busbar, twee MPPT's, batterij en panelen](img/pv-plan.png)

**In het eendraadschema** wordt dat één aftakking: de omvormer op de kringlijn, dan de verticale **DC**-busbar, met per toestel een rij. De MPPT met panelen komt bovenaan, de andere MPPT en de batterij parallel eronder. Boven elke lijn staat de kabel, onder elk symbool het type, het vermogen en de serienummers:

![De PV-installatie in het eendraadschema](img/eendraad-pv.png)


### E. Domotica

In een domotica-installatie zitten de **modules (relais, dimmers, rolluikmodules) in het verdeelbord**; op het plan staan alleen de drukknoppen, sensoren en de verbruikers.

Doel (zoals in de voorbeeldwoning): drie inbouwspots in de keuken op een schakelmodule, een gedimde ledstrip, een rolluik in de living, een domotica-drukknop en een aanwezigheidsmelder.

1. **Modules aanmaken**: klik op een plan Elektriciteit bovenaan op **Domotica** (of **Domotica…** in het paneel).
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
   | M1.1 | B2 Inbouwspot ×3 – Keuken | M4.1 drukknop, M4.2 aanwezigheidsmelder |
   | M2.1 | B3 LED-strip – Keuken | M4.1 drukknop |
   | M3.1 | R1 Rolluik – Living | – |

5. **CSV exporteren** in het venster Domotica geeft deze lijst voor de programmeur.

   ![Het venster Domotica met modules, kanalen en bediening](img/domotica.png)

6. **Eendraadschema**: in elke aftakking komt het **relaiscontact met zijn adres** vóór de verbruikers; de kring die de modules voedt krijgt een **modulevak** met hun namen. Drukknoppen komen niet in het 230 V-schema.

![Domotica in het eendraadschema: relaiscontacten M2.1 en M1.1 in kring B](img/eendraad-dom.png)

### F. Een bestaand plan overtekenen (PDF als achtergrond)

1. Kies onder *Grondplan* **Achtergrond (afbeelding / PDF)** en open het bestand (een PDF wordt eenmalig met internet omgezet; bij meerdere pagina's kies je de pagina).
2. Bij een PDF vraagt Kringo de **schaal** (bv. 50 voor 1:50): dan krijgt het plan meteen zijn echte maat. Laat leeg om de schaal zelf te bepalen.
3. **Schaal bepalen**: klik twee punten waarvan je de afstand kent (bv. de buitenmaat van een gevel) en geef de werkelijke afstand in cm.
4. Sleep de achtergrond op zijn plaats, zet de *Dekking* op 30–50 % en **vergrendel** hem.
5. Teken de muren erover. Kies *Mee afdrukken* als de achtergrond op de afdruk moet.

![Een plan als achtergrond, met Schaal bepalen (twee punten, 500 cm)](img/background.png)

### G. Ruimtes en uitwendige invloeden

Het AREI (Boek 1, 2.10) vraagt de **uitwendige invloeden** per ruimte: omgevingstemperatuur (AA), water (AD), vreemde lichamen (AE) … tot structuur van gebouwen (CB), plus of de ruimte publiek toegankelijk is. Kringo maakt daar het document van.

1. **Ruimtes tekenen** (onder *Grondplan*):
   - **Ruimte**: klik in een kamer. Kringo zoekt de omtrek tussen de muren; verplaats je later een muur, dan past de ruimte zich aan.
   - **Ruimte (hoeken)**: voor ruimtes zonder muren rondom (open keuken, buiten). Klik de hoeken: ze snappen op elke hoek van de muuromtrek (ook waar een binnenmuur een buitenmuur of een andere binnenmuur raakt) en op de muurvlakken. Zo'n hoek blijft aan de muren hangen en beweegt mee; Alt = vrij plaatsen. Sluit met het eerste punt, dubbelklik of Enter.
   - **Ruimtescheiding**: een stippellijn die je tekent zoals een muur. Ze splitst een open ruimte (bv. zithoek en open keuken) zodat **Ruimte** elk deel apart vindt, en **Ruimte (hoeken)** snapt er ook op. Kabels lopen er gewoon door en er kunnen geen deuren of ramen in. Een bestaande muur kan je via *Soort* ook omzetten naar een ruimtescheiding.
2. Geef een **naam**. Uit de naam kiest Kringo een **sjabloon** (keuken, badkamer, garage, technische ruimte, terras …) dat de codes invult; dat kan je achteraf wijzigen.
3. In de eigenschappen klap je een code open en klik je de **klassen** aan (groen = gekozen), elk met hun omschrijving – meerdere tegelijk mag (bv. AA 4, 5 en 8). Codes die afwijken van een normaal lokaal zijn gemarkeerd en staan op het plan onder de naam en de oppervlakte.
   Met **★ Opslaan als sjabloon…** bewaar je de instellingen van een ruimte (codes, publiek toegankelijk, kleur) als eigen sjabloon. Het staat dan met ★ in de lijst, in elk project op deze computer, en wordt ook in het project zelf bewaard. Een nieuwe ruimte waarvan de naam het sjabloon bevat, krijgt het automatisch. **Sjabloon verwijderen** haalt het weg; ruimtes houden hun waarden.

   ![Ruimtes met kleur, oppervlakte en afwijkende codes; rechts de uitwendige invloeden](img/rooms.png)

4. **Invloeden** bovenaan (die knop staat er enkel op een plan **Elektriciteit**; ook **Invloeden…** in het paneel van dat plan, of **▦ Tabel…** bij een ruimte) toont de tabel van alle ruimtes met referentie, datum en adres. **CSV exporteren** geeft de lijst voor Excel; **Blad genereren** maakt het A3-blad zoals het Normec-overzicht, met vakken voor de handtekeningen van de exploitant en het erkend organisme.

   ![De tabel met uitwendige invloeden](img/influences.png)

   ![Het blad met uitwendige invloeden](img/influences-sheet.png)

> De sjablonen zijn een vertrekpunt. De uitwendige invloeden worden bepaald door de uitbater en nagekeken door het erkend organisme – pas ze aan aan de werkelijke situatie.

### H. Kabeltrace en kabellengtes

1. Zet een **Verdeelbord** (Energie) op het grondplan. Met meerdere borden kies je in de eigenschappen van het symbool welk bord het is.
2. Klik bovenaan op **Kabels** (die knop staat er enkel als een plan **Elektriciteit** open is; ook via **Kabels…** in het paneel) en dan op **Kabeltrace genereren**. Per kring loopt een route van het verdeelbord naar het eerste punt en daarna van punt naar punt, in de volgorde van de nummers (bij hetzelfde nummer eerst de schakelaar, dan de lampen). Elk domotica-uitgangskanaal krijgt een eigen kabel vanaf het bord. De DC-kant van zonnepanelen telt niet mee.
3. De kabels gaan enkel door **deuren, deuropeningen, schuifdeuren en garagepoorten** – niet door muren of ramen, en niet buiten het gebouw om. De kabels lopen met rechte hoeken, liefst op 20–30 cm van de muren, en waar ze dezelfde weg nemen liggen ze mooi gebundeld naast elkaar. Elke kring krijgt een kleur; de kabel vanaf het bord is dikker en draagt de naam van de kring. Met het vinkje **kabels** in de werkbalk zet je de overlay aan of uit.

   ![Kabeltrace op het grondplan](img/cables-plan.png)

4. De lengte = de route op het plan + de verticale stukken naar elke doos (hoogtes onder **Hoogtes en reserve**: verdeelbord, stopcontacten, schakelaars, wandverlichting, toestellen, plafond, verdiepingshoogte) + een extra stuk per aansluiting + de reserve in %. Plafondpunten worden via het plafond bereikt, de andere via de vloer. Een punt kan een eigen **Hoogte (cm)** krijgen in zijn eigenschappen. Punten op een andere verdieping lopen via een stijgleiding op de plaats van het verdeelbord.
5. Het type kabel komt uit de kring (bv. VOB Eca 3G2,5²). Je krijgt een lijst **per kabeltype** en **per kring**, ook als CSV.
6. **Data en bus** (gestreepte lijnen): elke **Datacontactdoos** krijgt een eigen **datakabel** vanaf de dichtstbijzijnde **Patchkast** (map *Diversen*; zonder patchkast vanaf het verdeelbord). De **buskabel** loopt vanaf het verdeelbord langs alle domotica-drukknoppen en -sensoren, telkens naar de dichtstbijzijnde volgende. Ze hebben geen kring nodig en staan als *Datakabel* en *Buskabel* in de lijst.

   ![Kabellengtes per type en per kring](img/cables.png)

> Het is een schatting: de routes volgen een raster van 10 cm door de ruimtes. Wijzig je het plan of de kringen, dan meldt Kringo dat je opnieuw moet genereren.

### I. Vloerverwarming

Vloerverwarming laat je **genereren** voor een hele verdieping, of je tekent ze zelf. Vloerverwarming heeft een eigen installatieplan, **Vloerverwarming** (Bladen, of ≋ Vloerverwarming ＋ in het paneel van de plattegrond), los van het CV-plan met ketel en radiatoren; zo blijft elk plan overzichtelijk. De knop **Vloerverwarming** bovenaan staat er enkel als dat plan open is (net zoals **Kabels** enkel op het plan Elektriciteit). Projecten van vóór 0.98: de buizen en collectoren van het CV-plan worden bij het openen naar het vloerverwarmingsplan verplaatst. De ruimtes duid je eerst aan op de plattegrond (zie G).

**Genereren**

1. Zet een **Collector vloerverwarming** op de verdieping (tegen een muur van een verwarmde ruimte).
2. Open het venster **Vloerverwarming** (bovenaan, of **♨ Genereren…** in het paneel van het vloerverwarmingsplan; bestaat dat plan nog niet, dan wordt het gemaakt). Vink de ruimtes aan die vloerverwarming krijgen (standaard allemaal; ook in de eigenschappen van een ruimte) en klik **Kringen genereren**.
3. Kringo verdeelt de vloer in kringen die elk binnen de **maximale lengte** blijven en legt ze als tegenstroomspiraal op de **legafstand** van de ruimte. De hele vloer wordt bedekt: de aanvoerleidingen naar verder gelegen ruimtes maken deel uit van hun kring en verwarmen de vloer waar ze passeren. Leidingen gaan door **deuren**, **muurdoorvoeren CV** en **ruimteverdelers**; in een deur en bij de collector liggen ze dichter bij elkaar.
4. Het venster meldt wat niet lukt: een ruimte zonder doorgang naar de collector, een kring die te lang blijft, meer kringen dan uitgangen. Met meerdere collectoren op een verdieping krijgt elke ruimte de dichtstbijzijnde.
5. De kringen zijn gewone buizen: klik er een aan om naam, kleur of punten aan te passen. **Opnieuw genereren** vervangt de gegenereerde kringen van die verdieping; zelf getekende buizen blijven staan. **Ctrl+Z** maakt het genereren ongedaan.

**Zelf tekenen**

Symbolen per type: op **Vloerverwarming** de collector; op **CV** de CV-ketel, radiator, convector en ventiloconvector; op **Sanitair** tappunten koud / warm water, watermeter en warmwaterboiler; op **Afvoer** afvoerpunt en vloerputje; op **Ventilatie** de ventilatie-unit en de toevoer- en afvoerventielen.

1. Zet een **Collector vloerverwarming** op het plan en vul in zijn eigenschappen het **aantal uitgangen** in. Zijn naam op het plan is de omschrijving of anders VV1, VV2 …
2. Kies links **Buis tekenen** (groep *Vloerverwarming*) en klik de punten van de buis: van de collector, door de ruimte (bv. als dubbele spiraal of meander) en terug naar de collector. **Dubbelklik**, **Enter** of de **rechtermuisknop** = klaar, **Backspace** = laatste punt terug, **Esc** = stoppen.
   - In een ruimte springen de punten op een **raster met de legafstand** van die ruimte, beginnend op de afstand tot de muur; de rasterpunten verschijnen in de ruimte onder je muis. Zo liggen de buizen vanzelf op de juiste afstand. Elk stuk is haaks op het vorige; **Alt** = vrij.
   - Dicht bij een collector springt het punt op de collector.
   - Tijdens het tekenen staat de **lengte** tot nu toe (en de legafstand) bij de cursor.
3. De buis krijgt de naam van de volgende kring van de dichtstbijzijnde collector (VV1.1, VV1.2 …) en een eigen kleur. Bochten worden afgerond getekend (standaard de halve legafstand). Op het plan staan naam en lengte bij elke kring.
4. Klik een buis aan voor haar eigenschappen: **lengte** (rood als ze langer is dan het maximum van de ruimte), naam, collector, kleur en bochtstraal. Sleep de punten om het verloop aan te passen; ze springen opnieuw op het raster. **Ctrl+D** dupliceert een kring.
5. **Legafstand** en **maximale lengte** stel je per ruimte in (klik de ruimte aan op het vloerverwarmingsplan) of als standaard in het venster **Vloerverwarming** bovenaan, samen met de afstand tot de muur.
6. Het venster **Vloerverwarming** toont per collector alle kringen met verdieping, ruimte (waar het grootste deel van de buis ligt), legafstand en lengte, het totaal aan buis en een waarschuwing bij te lange kringen of te weinig uitgangen; ook als CSV.

### J. Ventilatiedebieten

Kringo berekent de nodige ventilatiedebieten van een woning volgens **NBN D 50-001** en zet ze op het ventilatieplan.

1. Duid de ruimtes aan op de plattegrond (zie G); hun oppervlakte komt uit de omtrek.
2. Open een plan **Ventilatie** en klik bovenaan op **Ventilatie** (of **≈ Debieten…** in het paneel; die knop staat er enkel op een ventilatieplan).
3. Per ruimte gokt Kringo de soort uit het sjabloon en de naam; pas ze aan waar nodig:
   - **droge ruimtes, toevoer (T)**: woonkamer 3,6 m³/h per m², minstens 75 m³/h (mag begrensd tot 150); slaap-, studeer- en speelkamer 3,6 m³/h per m², minstens 25 (mag begrensd tot 72);
   - **natte ruimtes, afvoer (A)**: gesloten keuken, badkamer en wasplaats 3,6 m³/h per m², minstens 50 (mag begrensd tot 75); open keuken 75 m³/h; WC 25 m³/h;
   - **gang / hal / trap**: doorstroomzone, geen eigen debiet; **geen ventilatie** voor berging, garage, technische ruimte …
4. Met het vinkje **Begrenzen** gebruikt Kringo het maximum dat de norm toelaat. In **Ontwerp** vul je een eigen debiet in (rood als het lager is dan nodig).
5. Kies het **ventilatiesysteem**: A (natuurlijk), B (mechanische toevoer), C (mechanische afvoer, toevoer via roosters) of D (mechanische toe- en afvoer).
6. **Balans** (systeem D): toe- en afvoer moeten gelijk zijn. Met **In balans brengen** verhoogt Kringo de kleinste kant proportioneel over haar ruimtes tot beide gelijk zijn (bv. afvoer 75 → 133 m³/h als de toevoer 133 m³/h is); de kolom **In balans** toont per ruimte het debiet en hoeveel erbij kwam. De tabel **Balans** geeft toevoer, afvoer en het verschil, vóór en na; daaronder het debiet van de **ventilatie-unit**. Wil je de balans liever zelf maken, vink het uit en pas de ontwerpdebieten aan tot het verschil 0 is.
7. **Ventielen**: zet **Toevoerventielen** en **Afvoerventielen** op het ventilatieplan. Het (gebalanceerde) debiet van een ruimte wordt over haar ventielen verdeeld: de kolom **Ventielen** toont de inregelwaarde per ventiel (bv. 67 + 66 m³/h). Een ruimte zonder ventiel, een ventiel buiten een ruimte of een afvoerventiel in een droge ruimte wordt gemeld. Een ruimte die normaal geen ventilatie nodig heeft (berging, garage, technische ruimte, hal), maar waar je toch een ventiel tekent, telt mee in de debieten en de balans: ze krijgt de kant van haar ventiel(en) (meeste afvoer- of toevoerventielen) en 25 m³/h per ventiel, of het eigen ontwerpdebiet dat je invult. In de tabel staat dan *niet verplicht – ventiel getekend*.
8. **Doorstroomopeningen**: minstens 70 cm² voor een WC, 140 cm² voor de andere ruimtes.
9. **Lucht door deuren en ramen** (systemen C en D): Kringo rekent de luchtstroming door de woning als een netwerk. Toevoerruimtes duwen lucht in, afvoerruimtes zuigen ze weg; deuren, deuropeningen, ruimtescheidingen en trappen (naar de verdieping erboven) zijn de verbindingen. Zo krijgt elke deur een **debiet en richting** (bv. Living → Keuken 133 m³/h), met de nodige doorstroomopening. Bij **systeem C** komt de toevoer van een droge ruimte via **regelbare roosters in haar ramen** (verdeeld naar raambreedte, debiet bij 2 Pa); de afzuiging bepaalt dan het werkelijke debiet door de deuren. Een ruimte zonder deur of een raam dat ontbreekt wordt gemeld.
   - **Trappen tussen verdiepingen**: een trap verbindt de ruimte waarin hij staat met de ruimte op dezelfde plaats op de verdieping erboven (de overloop), waar hij ook vanzelf in stippellijn verschijnt. Teken de trap op de onderste verdieping. Teken je op de verdieping erboven nog een trap op dezelfde plaats, dan is dat de **volgende trap naar boven** (trappen boven elkaar in één trappenhal), zolang er erboven nog een verdieping met een ruimte op die plaats is; op de bovenste verdieping telt hij als dezelfde trap, één keer. Voorwaarden: de verdiepingen liggen op elkaar (dezelfde plaats in het plan) en op beide verdiepingen is de ruimte rond de trap aangeduid (hal en overloop). In de eigenschappen van de trap kies je **Verbinding naar andere verdieping**: automatisch, naar boven, naar onder of **geen** (een gesloten trap of een trap met een deur). Het debiet door de trap staat in de tabel (*via Trap*) en op het plan (↕).
10. **Op het plan zetten** plaatst onder de naam van elke ruimte een label *T 133 m³/h* (blauw) of *A 133 m³/h* (oranje) en naast elk ventiel zijn inregelwaarde met een verwijslijn, bij systeem C en D een groene pijl met het debiet door elke deur (↕ bij de trap) en bij systeem C het roosterdebiet bij elk raam, op het ventilatieplan van de verdieping (gemaakt als het nog niet bestaat). Je kunt de labels verslepen; **opnieuw plaatsen** werkt de debieten bij en houdt hun plaats (ook als je een ventiel verplaatst). **CSV exporteren** geeft de tabel voor Excel.

De berekening is een hulp bij het ontwerp: controleer de waarden en de EPB-eisen van het project.

## 7. Besturing: stuurkast

Een besturingsproject heeft vier soorten bladen. In de lijst **Pagina's** staan ze in groepen: **⚡ Elektrisch**, **💨 Pneumatica**, **💧 Hydraulica** en **❄ Koeling**; met de **＋** naast een groep voeg je een blad van die soort toe. De bibliotheek toont enkel de symbolen die bij het actieve blad horen: *Standaard* en *AREI* op elektrische bladen, *Pneumatica* op pneumatische bladen, *Hydraulica* op hydraulische bladen en *Koeling* op koelbladen. Toestellen op die laatste krijgen een eigen codering (standaard `{prefix}{n}` → *V1*, *A1*; in *Instellingen*).

- **Pagina's** op A3 met kolommen en rijen, titelblok met bedrijf en logo (*Gegevens*). Voor grote schema's (bv. hydraulica) kies je per pagina een groter **Bladformaat**: A2, A1 of A0 liggend, in de pagina-eigenschappen of bij *＋ Pagina*. Kolommen en rijen groeien mee (ongeveer even groot als op A3), het titelblok staat rechtsonder en voedingslijnen tot de rand schuiven mee. Afdrukken en PDF gebruiken per pagina het eigen formaat.
- **Voedingslijnen** (L1 L2 L3 N PE, +24V / 0V …) in de pagina-eigenschappen; zelfde naam = zelfde potentiaal over alle pagina's.
- **Draad** (`W`): klik op een pin, knikpunten, eindigt vanzelf op een pin, draad of voedingslijn.
- **Koppelen** van contacten aan een spoel of drukknop: gedeelde tag, kruisverwijzing (/2.4) en contactspiegel.
- **Lijsten**: toestellen, klemmen, draden, PLC – CSV en afdrukken.
- **Symbooleditor** voor eigen symbolen; symbolen importeren / exporteren of een map op schijf koppelen.
- **QElectroTech**: *Open bestand* opent ook `.qet`-projecten.

### Simuleren

- Klik **▶ Simuleren** in de werkbalk. Het blad krijgt een groene rand en kan niet bewerkt worden.
- Klik op een **drukknop** om hem in te drukken (zolang je de muis inhoudt), **Shift+klik** houdt hem vast. Noodstop, keuzeschakelaar en sleutelschakelaar wisselen bij elke klik.
- **Actieve lijnen gloeien groen**: draden onder spanning, bekrachtigde spoelen en bediende contacten; lampen branden geel. Contacten volgen hun spoel (ook met opkom- of afvalvertraging), beveiligingen en klemmen geleiden.
- De voeding komt van de voedingslijnen: *L, L1–L3, +24V* zijn de plus, *N, 0V* de min.
- **⏸** pauzeert, **⟲** zet alles terug in de beginstand, de snelheid kies je van ¼× tot 2×, **■ Stop** of `Esc` stopt. Wijzig je iets aan het schema, dan stopt de simulatie.
- **◫ Gesplitst venster** (werkbalk) zet een tweede blad naast de editor, met een eigen bladkeuze, zoom en pannen (sleep de scheidingslijn om de verdeling aan te passen; op een smal scherm komen ze onder elkaar). Zo bedien je op het ene blad (bv. de drukknoppen) en volg je de simulatie op het andere (bv. de hydraulica); ook in het tweede venster klik je drukknoppen en ventielen aan. Met **Volgen** springt het tweede venster vanzelf naar het blad waar iets verandert (een spoel, ventiel of cilinder); **✎** opent dat blad in de editor, dubbelklikken ook (buiten de simulatie).

## 8. Besturing: hydraulica en pneumatica

Pneumatische schema's teken je op de bladen van de groep **💨 Pneumatica**, hydraulische op die van **💧 Hydraulica**. Bladen uit oudere versies (één groep voor beide) worden volgens hun symbolen ingedeeld. Het demoproject **Besturing** heeft er vijf: een elektrisch gestuurde cilinder (zie *Elektrisch sturen* hieronder), automatische terugloop (drukknopventiel, 5/2-impulsventiel, rolventiel, smoor-terugslagventielen), tweehandbediening met een EN-ventiel, hydraulisch heffen (aggregaat, drukbegrenzer op 40 bar, filter, 4/3-hendelventiel) en een pendelbeweging met pulsteller.

![Simulatie: bolletjes van rood (6 bar) tot blauw (retour), met de druk op de leidingen](img/fluid-sim.png)

**Tekenen**

- De symbolen (ISO 1219) staan in de mappen **Pneumatica** en **Hydraulica**: ventielen; cilinders en motoren (enkel- en dubbelwerkend, veer links of rechts, doorgaande zuigerstang, eindstanddemping, instelbaar, magnetische zuiger, telescoopcilinders, zwenkaandrijving, drukverhogers en omvormers); voeding (drukluchtbron, energiebron, compressor, luchtketel, onderhoudseenheid, hydraulisch aggregaat); filters en luchtbehandeling (filters, waterafscheiders, droger, olievernevelaar, onderhoudseenheden); warmtewisselaars (verwarmer, koeler, temperatuurregelaar); tanks en accumulatoren; leidingelementen; sensoren (manometers, drukindicator, thermometer, niveaumeter, debietmeters, drukschakelaar, eindschakelaar, pulstellers). Leidingen teken je met het draadgereedschap (`W`).
- **Ventielen** zijn instelbaar in de eigenschappen: type (2/2, 3/2, 4/2, 5/2, 4/3, 5/3), bediening links en rechts (veer, hand, drukknop, hendel, rol, pneumatisch / hydraulisch gestuurd, elektromagneet) en de middenstand (gesloten, ontlucht, belucht, vrijloop, tandem, open). De poorten staan op de ruststand.
- **Cilinders**: uitvoering, zuigerstang, demping, slag (mm), tijd voor de volle slag (s) en **markeringen**, bv. `1S1=0; 1S2=100`. Een **rolventiel** of **eindschakelaar** met de naam van een markering (bv. tag *1S2*) wordt bediend als de zuigerstang daar staat.

**Elektrisch sturen**

De simulatie loopt over alle bladen tegelijk, dus de elektrische bladen sturen de pneumatiek en hydraulica aan:

- Een ventiel met **elektromagneet** schakelt als de spoel met dezelfde naam onder spanning staat, bv. *Spoel links* = `-5Y3` volgt het magneetventiel (symbool *Magneetventiel*) met tag *-5Y3* op een elektrisch blad. De keuzelijst bij het veld toont de spoelen in het project.
- Een **eindschakelaar** (maak / verbreek) op een elektrisch blad volgt de **markering** van een cilinder met dezelfde naam (veld *Markering*), en een contact gekoppeld aan een **drukschakelaar** schakelt op de druk.
- Voorbeeld in het demoproject: op *Elektropneumatiek – sturing* zet **Start** relais K onder spanning (zelfhouding); K bekrachtigt de spoel van ventiel 5V1 op *Elektropneumatiek – cilinder*, de cilinder schuift uit tot de eindschakelaar (verbreek) K laat afvallen, en de veer zet het ventiel terug.

**LS-stuurblok (type M4-15)**

In de map *Hydraulica → Stuurblok LS (M4)* staan de onderdelen en de volledige blokelementen van een load-sensing stuurblok (zoals Bosch Rexroth M4-15):

De hoofdschuif, de voorstuurventielen, de poortbeveiliging en de drukweegschaal, en het volledige inlaatelement, de ventielsectie en de eindplaat zijn **overgenomen uit de tekening van de datasheet** (zelfde lijnen, maatvast: kanalen op het raster van 5 mm).

- **Onderdelen** (*Onderdelen*, dubbele grootte): hoofdschuif proportioneel en hydraulisch voorgestuurd (a onderaan, b bovenaan) met handhefboom en slagbegrenzing; links T, LS, P, T en rechts A, LS A, LS B, B. Proportioneel drukreduceerventiel 3-weg (voorsturing, met magneet: P van de stuurolie X, T naar Y, A naar de schuif, met terugkoppeling van A tegen de veer). Secundaire drukbegrenzer met naaszuigfunctie (poort A / B naar T). Individuele drukweegschaal type S met lasthoudfunctie (veer + LS tegen de inlaatdruk). Verder drukreduceerventiel en drukbegrenzer voor de stuurolie, LS-wisselventiel, stuuroliefilter, blindplug en meetaansluiting. Hiermee teken je zelf een blok in detail; ze werken ook in de simulatie.
- **Blokelementen**: *Inlaatelement* (60 mm breed: P, X afgesloten, Y, LS, meetaansluiting MP, T; maakt de stuurolie X), *Ventielsectie elektrohydraulisch proportioneel* (97,5 mm: A, B, meetaansluitingen Ma / Mb) en *Eindplaat* (30 mm, T1). Zet ze **naast elkaar**: de kanalen P, X, Y, LS en T lopen door en verbinden vanzelf. In de eigenschappen van een sectie vul je de magneten a (P → A) en b (P → B) in – de namen van de spoelen op een elektrisch blad – en het stuursignaal, de poortbeveiliging, drukweegschaal en debieten.
- **Simulatie** (volgens datasheet RE 64283):
  - het **stuursignaal** (0 … 100 %, bij 24 V = 0,45 … 0,8 A) geeft een stuurdruk van 6,5 … 17,2 bar op de veerkamer (meetbaar op Ma / Mb, begrensd door de stuurolie X);
  - de **schuif** begint te bewegen bij 6,5 bar en staat volledig om bij 17,2 bar; de schuif in de tekening schuift mee. Magneet a (stuurdruk onderaan) duwt de schuif omhoog: P → A, B → T; magneet b: P → B, A → T;
  - het **debiet** (snelheid van de cilinder) volgt de slag; de drukweegschaal houdt het onafhankelijk van de last. Klik links of rechts op een sectie voor de **handhefboom** (volle slag; Shift = vasthouden);
  - A of B krijgt de pompdruk (begrensd door de poortbeveiliging, 230 bar), de andere poort gaat naar de tank en de lastdruk gaat naar LS.

  Het demoproject heeft een volledig blok met inlaat, vijf secties en eindplaat op een A1-blad (*Stuurblok M4-15*), met drukknoppen voor de tien magneten op het blad *Stuurblok M4 – magneten*.

**Simuleren**

- **▶ Simuleren** werkt zoals bij de stuurkast. Klik **links of rechts op een ventiel** om die kant te bedienen (hand, drukknop, hendel of spoel); Shift = vasthouden. Gestuurde ventielen schakelen op druk, rolventielen op de cilindermarkeringen.
- Op de leidingen onder druk en de **retourleidingen** (open naar de afvoer of tank) staan **bolletjes** in een kleur van **blauw** (0 bar) tot **rood** (hoogste druk, apart voor pneumatica en hydraulica); op leidingen onder druk staat ook de **druk**. Waar het medium stroomt – van de bron naar een bewegende cilinder of motor en van de andere kamer naar de afvoer – lopen de bolletjes in de stroomrichting, even snel als de zuiger beweegt; elders en op zijtakken staan ze stil.
- Ventielen verschuiven, zuigers en motoren bewegen, manometers tonen hun druk en pulstellers tellen.
- Smoorventielen vertragen de beweging (meter-out met een smoor-terugslagventiel werkt zoals verwacht); OF- en EN-ventielen, drukregelaar, drukbegrenzer en drukverhoger werken ook.

> De simulatie is functioneel (zoals de eenvoudige modus van FluidSIM): druk aan / uit en de ingestelde druk, geen krachten of debieten. Accumulatoren, warmtewisselaars en meetinstrumenten zonder druk zijn enkel getekend. Ze is zo opgebouwd dat een fysisch model later kan volgen.

## 9. Besturing: koelcircuits van machines

Koelcircuits teken je op de bladen van de groep **❄ Koeling**: het koelwater (of glycol) van een machine én de koelmiddelkring van een chiller. Het demoproject **Besturing** heeft er een voorbeeld van: *Koelwater spindel met chiller*, gestuurd vanaf het elektrische blad *Koeling – sturing*.

![Simulatie van een chiller: stroombolletjes van rood (warm) tot blauw (koud), met de temperaturen op de leidingen](img/cooling-sim.png)

**Symbolen** (map *Koeling*)

- **Koelwater:** pomp, open reservoir, expansievat, filter, vuilvanger, verbruiker / warmtebron (spindel, kast, matrijs …), koelradiator (passief), luchtkoeler / droge koeler met ventilator, koelaggregaat (chiller als geheel), platenwarmtewisselaar, kogelkraan, magneetventiel, driewegklep (motor of thermostatisch), terugslagklep, ontluchter en aftapkraan.
- **Koelmiddel:** compressor, condensor (lucht- of watergekoeld), verdamper (luchtkoeler of watergekoeld), thermostatisch expansieventiel, capillair, magneetventiel, afsluiter, terugslagklep, filterdroger, kijkglas, vloeistofvat en zuiggasafscheider.
- **Instrumenten** (P&ID-bol op de leiding): thermostaat **TS**, debietschakelaar **FS**, niveauschakelaar **LS**, hoge- en lagedrukpressostaat **PSH** / **PSL**, thermometer **TI**, manometer **PI** en debietindicator **FI**.

In-lijnonderdelen hebben links en rechts een aansluiting; warmtewisselaars, watergekoelde condensors en verdampers hebben er vier (boven het ene medium, onder het andere). Leidingen teken je met het draadgereedschap (`W`).

**Elektrisch sturen**

- Bij een **pomp**, **compressor** of **ventilator** vul je in door welke spoel (contactor) hij aangestuurd wordt, bv. `-6K2`; de keuzelijst toont de spoelen in het project. Een ventilator zonder spoel draait altijd.
- Een **magneetventiel** of **motordriewegklep** volgt de spoel met dezelfde naam (symbool *Magneetventiel* op een elektrisch blad).
- Een **contact** (maak / verbreek) op een elektrisch blad koppel je met *Koppelen aan toestel* aan een thermostaat, debiet-, niveau- of drukschakelaar.

**Vermogens en temperaturen**

| Onderdeel | Instellingen |
|---|---|
| Pomp | debiet (l/min), koelmiddel (water, glycol 30 % of 50 %) |
| Reservoir | inhoud (l), begintemperatuur (°C) |
| Verbruiker (warmtebron) | warmtevermogen (kW) |
| Chiller (als geheel) | koelvermogen (kW), vertrektemperatuur (°C) |
| Koelradiator (passief) | koelvermogen bij 10 K verschil met de lucht (kW), luchttemperatuur (°C) – het vermogen daalt naarmate het water de luchttemperatuur nadert, het water wordt nooit kouder dan de lucht |
| Luchtkoeler / droge koeler | koelvermogen (kW), luchttemperatuur (°C) – koelt tot ca. 3 K boven de lucht |
| Verdamper (watergekoeld) | koelvermogen (kW) – koelt tot ca. 2 K boven de verdampingstemperatuur |
| Condensor (watergekoeld) | warmteafgifte aan het koelwater (kW) |
| Platenwarmtewisselaar | rendement ε |
| Compressor | verdampings- en condensatietemperatuur (°C) |
| Thermostaat (TS) | schakeltemperatuur (°C), hysterese (K), warm of koud |

Debiet, vermogens en inhoud staan ook bij het symbool. Elk onderdeel verandert de watertemperatuur met ΔT = P / (ṁ · cp); het reservoir en de pomp hebben een inhoud, dus de temperaturen stijgen en dalen in de tijd. Kies een snelheid van 5× of 10× om een volledige koelcyclus te volgen.

**Simuleren**

- Een draaiende pomp laat het water stromen door alle leidingen die op een open weg van de pers- naar de zuigzijde liggen; bij een aftakking verdeelt het debiet zich, bij een samenkomst mengt het water.
- Op elke stromende leiding staat de **temperatuur**, en **stroombolletjes** lopen over de leiding in de richting van de stroming. Hun kleur loopt van **blauw** (koudste leiding) naar **rood** (warmste), apart voor het koelwater en het koelmiddel; hun snelheid volgt het debiet van de pomp (en de simulatiesnelheid). Bij een splitsing verdeelt de snelheid zich over de takken, bij een samenkomst telt ze weer op. Ook een leiding die tegen de stroomrichting in getekend is, toont de juiste richting.
- In de koelmiddelkring is alles van de compressor tot het expansieventiel de **hogedrukzijde** (persgas, vloeistofleiding), de rest de **lagedrukzijde** (na het expansieventiel, zuigleiding).
- **Afpompen:** sluit het magneetventiel terwijl de compressor draait, dan daalt de zuigdruk en valt de lagedrukpressostaat af; gaat het ventiel weer open, dan stijgt de druk en start de compressor opnieuw. Een compressor zonder werkende condensor (ventilator uit, geen koelwater) bouwt een hogedrukstoring op.
- Klik op een pomp, compressor of klep om ze met de hand te bedienen, op een **verbruiker** om de machine stil te zetten, op een **niveauschakelaar** om een te laag niveau na te bootsen. Een verbruiker zonder debiet kleurt rood.
- De thermostaat meet met een kleine vertraging (zoals een voeler in een dompelhuls) en schakelt met hysterese; debiet- en drukschakelaars schakelen met een korte vertraging. Plaats de thermostaat bij voorkeur op het reservoir of de zuigleiding van de pomp: na een verbruiker of verdamper verandert de temperatuur te snel.

> De berekening is een eenvoudige warmtebalans: vaste debieten, geen drukval of warmteverlies in leidingen, en in de koelmiddelkring vaste verdampings- en condensatietemperaturen.

## 10. Besturing: bouwblokken (sub-schema's)

Een **bouwblok** is een stuk schema dat je één keer tekent en daarna als één symbool zo vaak plaatst als je wilt: een motorvertrek, een ventiel met cilinder, een stuurblok met al zijn interne onderdelen … Een bouwblok bestaat uit gewone symbolen en draden, dus het werkt ook in de **simulatie**.

**Een bouwblok maken**

1. Klik in de paginalijst bij **🧩 Bouwblokken** op **＋**. Geef een naam, kies het soort (elektrisch, pneumatica, hydraulica of koeling: dat bepaalt de symbolen in de bibliotheek) en de letter van de tag (standaard *A*). Een bestaand blad maak je een bouwblok met **Dit blad is een bouwblok** in de eigenschappen van het blad.
2. Teken de inhoud met de gewone symbolen en draden.
3. Zet een **Aansluitpunt** (map *Bouwblok*) op elke plaats waar het blok met de rest van het schema verbindt, en geef het een naam (bv. *P*, *A*, *L1*, *13*). Draden die op een **voedingslijn** van het blad eindigen (bv. +24V / 0V) blijven met die voedingslijn verbonden: een geplaatst blok hangt vanzelf aan de +24V en 0V van het project.

In de eigenschappen van het blad stel je de standaard weergave en het kader rond de inhoud in (streep-punt, doorlopend of geen).

**Een bouwblok plaatsen**

Het blok staat in de bibliotheek onder **Bouwblokken / *naam van het project***. Klik het aan en plaats het op een ander blad. Per geplaatst blok kies je de **weergave**:

- **Volledige inhoud**: alle symbolen en draden van het blok zijn zichtbaar, met een kader eromheen. De aansluitpunten zijn de pinnen van het blok.
- **Compact kader**: een rechthoek met de naam en alleen de aansluitpunten, elk aan de kant waar het in de volledige tekening het dichtst bij de rand staat.

Een geplaatst blok gedraagt zich als één symbool: klikken selecteert het hele blok, en verslepen, draaien en spiegelen doen het hele blok. Wijzig je het blad van het bouwblok, dan veranderen alle geplaatste blokken mee.

**Tags en eigenschappen**

- De toestellen in een geplaatst blok krijgen de tag van het blok vooraan: blok *-A1* met *-K1* en *-Y1* erin geeft *-A1-K1* en *-A1-Y1*; op procesbladen wordt *A3* met *1V1* erin *A3.1V1*. Zo kun je een blok meermaals plaatsen zonder dubbele tags.
- Eigenschappen die naar een toestel in hetzelfde blok verwijzen (bv. de spoel van een ventiel) volgen die tag vanzelf. Met **{tag}** in een eigenschap zet je de tag van het geplaatste blok in de waarde.
- Bij **Inhoud van het bouwblok** in de eigenschappen van een geplaatst blok kun je per toestel een andere waarde opgeven, alleen voor dat blok (bv. de naam van de spoel op een elektrisch blad, of een andere functietekst).

**Simulatie**

De inhoud van een geplaatst blok simuleert mee, alsof ze op het blad getekend is. Bij de volledige weergave klik je op drukknoppen en ventielen in het blok zoals elders. Het blad van het bouwblok zelf is enkel een sjabloon en simuleert niet mee.

**Herbruiken in andere projecten**

Met **Bewaren in Mijn symbolen** (eigenschappen van het blad) komt het blok in de bibliotheek onder *Mijn symbolen / Bouwblokken*, met de eigen symbolen die het gebruikt. Daarna wordt de knop **Bijwerken in Mijn symbolen**. In een ander project kies je bij een bouwblok in de bibliotheek (⋯) **Als bouwblok in dit project bewerken** om het als blad aan te passen en daarna opnieuw te bewaren.

## 11. Bewaren, openen, afdrukken

- Projecten worden **automatisch** in de browser bewaard.
- **Bewaar bestand** (diskette) maakt een `.kringo`-bestand om door te sturen of als back-up; **Open bestand** opent `.kringo` en `.qet`.
- **Afdrukken / PDF** (printer): kies alles, alle plattegronden, de huidige plattegrond of het eendraadschema; kies in het afdrukvenster *Opslaan als PDF* en zet de marges op *Geen*. Alles op A3 liggend, plattegronden op schaal.

## 12. Sneltoetsen

**Grondplan:** `W` muur · `A` gebogen muur · `D` deur · `N` raam · `M` maatlijn · `T` ruimtenaam · `L` koppelen · `R` draaien · `V` selecteren · `H` pannen · `Del` verwijderen · `Ctrl+C / X / V` kopiëren / knippen / plakken (bij de muis) · `Ctrl+D` dupliceren · `Ctrl+A` alles selecteren · `Ctrl+Z / Y` ongedaan / opnieuw · `F` passend · `Alt` zonder raster / niet tegen de muur · `Backspace` laatste punt terug (vlak, lijn, ledstrip).

**Stuurkast:** `V` selecteren · `W` draad · `T` tekst · `B` kader · `R` draaien · `M` spiegelen · `Ctrl+C / X / V / D` · `Ctrl+Z / Y` · `F` passend · `PgUp / PgDn` pagina.

**Rechtermuisknop** (grondplan en schema's, met het selectiegereedschap): menu met knippen, kopiëren, plakken (op de plaats van de klik), dupliceren, draaien, verwijderen en alles selecteren. Op een Mac met `⌘` in plaats van `Ctrl`. Muren worden met hun deuren en ramen gekopieerd, symbolen met de koppelingen ertussen; symbolen plak je op een installatieplan, muren, trappen en teksten op de plattegrond.

**Tablet:** knijpen = zoomen, twee vingers = verschuiven, lang drukken = rechtermuisknop.
