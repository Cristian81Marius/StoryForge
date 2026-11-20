# Istorioare cu tâlc – Stil canal

Stilul vizual al canalului de YouTube (Shorts/Reels) cu cele 600 de istorioare religioase ale părintelui Iosif Trifa, în română și engleză. Pentru familii și copii, cald și prietenos, cu aspect premium de carte de povești ilustrată.

**Regula de bază: fiecare episod nou pornește de la episodul de referință, nu de la zero.** Codul lui e în `components/ReelTemplate/template.dc.html`, iar varianta redată live e în cardul ReelTemplate. Preia de acolo personajele, simbolurile, animațiile, caseta de text și motorul de scene, apoi schimbă doar conținutul.

## Formatul
- Vertical **1080×1920**. Scenele se succed automat, cu estompare de 0.6 s; setările Tweaks: pornire automată, buclă, scena de început, subtitrări.
- **Durata depinde de poveste, nu e fixă.** Câte o scenă pentru fiecare moment al poveștii (de obicei 6–12 scene, a câte 5–12 s), apoi învățătura, întrebarea și finalul. O istorioară scurtă iese pe la 40–50 s, una bogată pe la 80–100 s. Nu tăia povestea ca să iasă scurtă.
- **Zone sigure**: caseta de text sus (192–600 px). Nimic important în ultimii 420 px de jos și în ultimii 140 px din dreapta.

## Densitatea (cel mai important pentru calitate)
- Fiecare scenă e o ilustrație completă, pe tot ecranul: fundal, plan mijlociu, personaje, detalii. Nu o iconiță pe fundal gol.
- **4–6 elemente animate în fiecare scenă**, care apar pe rând: personaje care merg, zboară sau se apleacă; stele, nori, raze, flăcări vii; strălucire care pulsează; detalii care apar (bule, săgeți, etichete, fructe).
- Personajele principale au **minimum 300 px înălțime** pe 1920.
- Măcar o mișcare de „cameră” pe episod, unde povestea o cere.

## Structura unui episod
1. **Titlu** (4 s): cer de noapte, titlul în Cinzel auriu, „o istorioară a părintelui Iosif Trifa”, urechi/simboluri care plutesc.
2. **Povestea**: o scenă pentru fiecare moment, cu dialogul în casetă.
3. **Învățătura**: 1–2 scene simbolice (ex. lumina trece de la ureche la inimă; din inimă crește un pom cu roade).
4. **Întrebarea** autorului, scrisă mare, cu ultima parte aurie.
5. **Finalul**: versetul (RO după Cornilescu, EN după KJV/WEB), apoi „Istorioara nr. X · 600 de istorioare religioase · Pr. Iosif Trifa”.

## Stilul vizual
- Ilustrație vectorială plată, degradeuri fine, forme rotunjite, lumină aurie caldă. Personaje simple, cu ochi-punct (vezi Personaje). Fără emoji, fără clipart, fără realism.
- Paleta: bleumarin `#0A1230`/`#22335F`, auriu `#FFD36B`/`#E6B347`, ivoriu `#FFF8E8`, mov-robă `#5D4A86`, verde `#84C66F`, roșu-inimă `#E3485C` (toate în tokens).
- Tipografie: **Cinzel** pentru titluri, **Lora** pentru text și citate.

## Istorioare diferite
Istorioarele nu au toate aceleași personaje. Folosește tipurile din Personaje și construiește-le pe cele noi (copil, țăran, rege, filozof, animal) după aceeași gramatică. Pentru comparațiile fără acțiune (ex. clopotele din New York, albinele și fumul), arată întâi imaginea comparației, apoi transformă-o în viața sufletului.

## Teme grele
Iad, diavol, moarte, dezastru: doar simbolic și de departe. Flăcări stilizate, siluete întunecate, fără chipuri chinuite, fără sânge. Diavolul e o umbră violet-închis sau fum, nu o figură de groază.

## Textul
Repovestit în cuvinte proprii, cald și simplu, maximum ~25 de cuvinte pe scenă. Engleza tradusă natural. Textul rămâne editabil.
