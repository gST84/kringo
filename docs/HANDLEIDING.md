# Handleiding Kringo

Kringo tekent elektrische installaties in de browser: **gebouwen** (plattegronden, AREI-symbolen, kringen en het eendraadschema), **stuurkasten** (industriële schema's) en **hydraulica / pneumatica** (ISO 1219-schema's); stuurkasten en hydraulische / pneumatische schema's kun je ook simuleren. Deze handleiding legt uit hoe je werkt, met uitgewerkte voorbeelden.

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
7. [Stuurkast](#7-stuurkast)
8. [Hydraulica en pneumatica (met simulatie)](#8-hydraulica-en-pneumatica-met-simulatie)
9. [Bewaren, openen, afdrukken](#9-bewaren-openen-afdrukken)
10. [Sneltoetsen](#10-sneltoetsen)

---

## 1. Starten

- **Online:** <https://gst84.github.io/kringo/> (Chrome, Edge of Safari).
- **Als app:** in Chrome / Edge op *Installeren* in de adresbalk; op iPad / iPhone in Safari via deelknop → *Zet op beginscherm*. Daarna werkt Kringo ook zonder internet.
- Bij het openen verschijnt het **welkomscherm**: kies de taal (Nederlands, Français, English), maak een **nieuw project** of open een recent project.

Bij een nieuw project kies je de soort: **Gebouw**, **Stuurkast** of **Hydraulica / pneumatica**. Die ligt daarna vast.

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

Alle tekentools staan links onder **Grondplan**.

### Muren

- **Muur** (`W`): klik punt na punt. Typ een lengte in cm en druk Enter voor een exacte maat. Klik op het beginpunt (of dubbelklik / Esc) om te stoppen. Kies vooraf het muurtype in de werkbalk (buitenmuur 30 / 40, binnenmuur 14 / 10, scheidingswand 7).
- **Gebogen muur** (`A`): klik het beginpunt, het eindpunt en dan een punt op de boog.
- Een geselecteerde muur heeft blauwe bolletjes: de **eindpunten** verlengen de muur (aansluitende muren schuiven mee, en binnenmuren die ertegen aansluiten blijven eraan vast), het **middelste** bolletje verschuift een rechte muur evenwijdig (hij blijft recht; aansluitende muren rekken mee). Met **Buigen** in de eigenschappen maak je er een gebogen muur van; bij een gebogen muur verandert het middelste bolletje de boog en maakt *Recht maken* hem terug recht.
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

### Uitlijnen en verdelen

Selecteer twee of meer symbolen of ruimtenamen (Shift-klik of een rechthoek slepen). In de eigenschappen staat dan de rij **Uitlijnen**: links, op één verticale lijn, rechts, boven, op één horizontale lijn, onder, en **horizontaal / verticaal gelijk verdelen**. Bij verdelen blijven het eerste en het laatste element staan; vul je *Afstand bij verdelen* in, dan krijgen ze die vaste afstand vanaf het eerste (links / boven).

### Achtergrond

Zie [voorbeeld F](#f-een-bestaand-plan-overtekenen-pdf-als-achtergrond).

## 4. Gebouw: symbolen, kringen en koppelingen

### Kringen en verdeelborden

Open **Kringen** bovenaan. Je bouwt er de boom: *verdeelbord → differentieel → kringen*, met differentiëlen achter differentiëlen en onderverdeelborden. Per kring stel je in: automaat of smeltzekering, curve, In, polen, Icn, kabel, brandklasse, aders, doorsnede, plaatsing en of de geleiders getekend worden. Opmerkingen van de AREI-controle staan meteen bij de kring.

![Het venster Kringen & verdeelborden](img/circuits.png)

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

4. **Invloeden** bovenaan toont de tabel van alle ruimtes met referentie, datum en adres. **CSV exporteren** geeft de lijst voor Excel; **Blad genereren** maakt het A3-blad zoals het Normec-overzicht, met vakken voor de handtekeningen van de exploitant en het erkend organisme.

   ![De tabel met uitwendige invloeden](img/influences.png)

   ![Het blad met uitwendige invloeden](img/influences-sheet.png)

> De sjablonen zijn een vertrekpunt. De uitwendige invloeden worden bepaald door de uitbater en nagekeken door het erkend organisme – pas ze aan aan de werkelijke situatie.

### H. Kabeltrace en kabellengtes

1. Zet een **Verdeelbord** (Energie) op het grondplan. Met meerdere borden kies je in de eigenschappen van het symbool welk bord het is.
2. Klik bovenaan op **Kabels** en dan op **Kabeltrace genereren**. Per kring loopt een route van het verdeelbord naar het eerste punt en daarna van punt naar punt, in de volgorde van de nummers (bij hetzelfde nummer eerst de schakelaar, dan de lampen). Elk domotica-uitgangskanaal krijgt een eigen kabel vanaf het bord. De DC-kant van zonnepanelen telt niet mee.
3. De kabels gaan enkel door **deuren, deuropeningen, schuifdeuren en garagepoorten** – niet door muren of ramen, en niet buiten het gebouw om. De kabels lopen met rechte hoeken, liefst op 20–30 cm van de muren, en waar ze dezelfde weg nemen liggen ze mooi gebundeld naast elkaar. Elke kring krijgt een kleur; de kabel vanaf het bord is dikker en draagt de naam van de kring. Met het vinkje **kabels** in de werkbalk zet je de overlay aan of uit.

   ![Kabeltrace op het grondplan](img/cables-plan.png)

4. De lengte = de route op het plan + de verticale stukken naar elke doos (hoogtes onder **Hoogtes en reserve**: verdeelbord, stopcontacten, schakelaars, wandverlichting, toestellen, plafond, verdiepingshoogte) + een extra stuk per aansluiting + de reserve in %. Plafondpunten worden via het plafond bereikt, de andere via de vloer. Een punt kan een eigen **Hoogte (cm)** krijgen in zijn eigenschappen. Punten op een andere verdieping lopen via een stijgleiding op de plaats van het verdeelbord.
5. Het type kabel komt uit de kring (bv. VOB Eca 3G2,5²). Je krijgt een lijst **per kabeltype** en **per kring**, ook als CSV.
6. **Data en bus** (gestreepte lijnen): elke **Datacontactdoos** krijgt een eigen **datakabel** vanaf de dichtstbijzijnde **Patchkast** (map *Diversen*; zonder patchkast vanaf het verdeelbord). De **buskabel** loopt vanaf het verdeelbord langs alle domotica-drukknoppen en -sensoren, telkens naar de dichtstbijzijnde volgende. Ze hebben geen kring nodig en staan als *Datakabel* en *Buskabel* in de lijst.

   ![Kabellengtes per type en per kring](img/cables.png)

> Het is een schatting: de routes volgen een raster van 10 cm door de ruimtes. Wijzig je het plan of de kringen, dan meldt Kringo dat je opnieuw moet genereren.

## 7. Stuurkast

- **Pagina's** op A3 met kolommen en rijen, titelblok met bedrijf en logo (*Gegevens*).
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

## 8. Hydraulica en pneumatica (met simulatie)

Een project **Hydraulica / pneumatica** is zuiver pneumatisch of hydraulisch (zonder elektrische sturing). Op het welkomscherm opent **Demoproject (pneumatica)** een uitgewerkt voorbeeld: drukknopventiel 1S1 laat cilinder 1A1 uitschuiven via een 5/2-impulsventiel, rolventiel 1S2 laat hem automatisch terugkeren.

![Simulatie: het ventiel is geschakeld, de leidingen onder druk gloeien groen](img/fluid-sim.png)

**Tekenen**

- De symbolen (ISO 1219) staan in de mappen **Pneumatica** en **Hydraulica**: ventielen; cilinders en motoren (enkel- en dubbelwerkend, veer links of rechts, doorgaande zuigerstang, eindstanddemping, instelbaar, magnetische zuiger, telescoopcilinders, zwenkaandrijving, drukverhogers en omvormers); voeding (drukluchtbron, energiebron, compressor, luchtketel, onderhoudseenheid, hydraulisch aggregaat); filters en luchtbehandeling (filters, waterafscheiders, droger, olievernevelaar, onderhoudseenheden); warmtewisselaars (verwarmer, koeler, temperatuurregelaar); tanks en accumulatoren; leidingelementen; sensoren (manometers, drukindicator, thermometer, niveaumeter, debietmeters, drukschakelaar, eindschakelaar, pulstellers). Leidingen teken je met het draadgereedschap (`W`).
- **Ventielen** zijn instelbaar in de eigenschappen: type (2/2, 3/2, 4/2, 5/2, 4/3, 5/3), bediening links en rechts (veer, hand, drukknop, hendel, rol, pneumatisch / hydraulisch gestuurd, elektromagneet) en de middenstand (gesloten, ontlucht, belucht, vrijloop, tandem, open). De poorten staan op de ruststand.
- **Cilinders**: uitvoering, zuigerstang, demping, slag (mm), tijd voor de volle slag (s) en **markeringen**, bv. `1S1=0; 1S2=100`. Een **rolventiel** of **eindschakelaar** met de naam van een markering (bv. tag *1S2*) wordt bediend als de zuigerstang daar staat.

**Simuleren**

- **▶ Simuleren** werkt zoals bij de stuurkast. Klik **links of rechts op een ventiel** om die kant te bedienen (hand, drukknop, hendel of spoel); Shift = vasthouden. Gestuurde ventielen schakelen op druk, rolventielen op de cilindermarkeringen.
- Leidingen onder druk **gloeien groen**, ventielen verschuiven, zuigers en motoren bewegen, manometers tonen hun druk en pulstellers tellen.
- Smoorventielen vertragen de beweging (meter-out met een smoor-terugslagventiel werkt zoals verwacht); OF- en EN-ventielen, drukregelaar, drukbegrenzer en drukverhoger werken ook.

> De simulatie is functioneel (zoals de eenvoudige modus van FluidSIM): druk aan / uit en de ingestelde druk, geen krachten of debieten. Accumulatoren, warmtewisselaars en meetinstrumenten zonder druk zijn enkel getekend. Ze is zo opgebouwd dat een fysisch model later kan volgen.

## 9. Bewaren, openen, afdrukken

- Projecten worden **automatisch** in de browser bewaard.
- **Bewaar bestand** (diskette) maakt een `.kringo`-bestand om door te sturen of als back-up; **Open bestand** opent `.kringo` en `.qet`.
- **Afdrukken / PDF** (printer): kies alles, alle plattegronden, de huidige plattegrond of het eendraadschema; kies in het afdrukvenster *Opslaan als PDF* en zet de marges op *Geen*. Alles op A3 liggend, plattegronden op schaal.

## 10. Sneltoetsen

**Grondplan:** `W` muur · `A` gebogen muur · `D` deur · `N` raam · `M` maatlijn · `T` ruimtenaam · `L` koppelen · `R` draaien · `V` selecteren · `H` pannen · `Del` verwijderen · `Ctrl+D` dupliceren · `Ctrl+Z / Y` ongedaan / opnieuw · `F` passend · `Alt` zonder raster / niet tegen de muur · `Backspace` laatste punt terug (vlak, lijn, ledstrip).

**Stuurkast:** `V` selecteren · `W` draad · `T` tekst · `B` kader · `R` draaien · `M` spiegelen · `Ctrl+C / X / V / D` · `Ctrl+Z / Y` · `F` passend · `PgUp / PgDn` pagina.

**Tablet:** knijpen = zoomen, twee vingers = verschuiven, lang drukken = rechtermuisknop.
