# Motorul v2 – Istorioare cu tâlc

Motorul v2 face aceleași reeluri 1080×1920 ca v1, dar cu personaje articulate, cameră cu paralaxă în fiecare scenă, tranziții variate, atmosferă, text care apare odată cu vocea, fundaluri gata desenate, sunete discrete și o randare mai curată. Stilul canalului rămâne același: ilustrație vectorială caldă, Cinzel auriu pentru titluri, Lora pentru text, ochi-punct, teme grele doar simbolic.

## Fișierele
| fișier | rol |
|---|---|
| `sablon-v2.html` | șablonul unui episod (titlu, poveste, rugăciune, acțiune, învățătură, întrebare, verset). Se copiază ca `ep-NNN-ro.html`. |
| `engine-v2.js`, `engine-v2.css` | motorul: scene, cameră, tranziții, atmosferă, text sincron, `renderAt(t)`, `REEL`. Nu se modifică pe episod. |
| `personaje-v2.js` | personajele articulate (oameni, îngenunchere, animale). |
| `fundaluri-v2.js` | fundalurile pe straturi. |
| `build_v2.py` | preview, draft, fit, render, mix, cover, check, sfxdemo. |
| `demo-v2.html` | demo-ul cu voce (timpii deja potriviți). |
| `fundaluri-demo.html` | toate fundalurile, câte o scenă. |
Structura de lucru: `work/pipeline/` (toate fișierele de mai sus + paginile episodului) și `work/fonts/` (Lora.ttf, Lora-Italic.ttf, Cinzel.ttf).

## Scena
```html
<div class="scene" data-cam="pan-r" data-tr="dip" data-amb="dust:18" data-grade="warm"
     data-sfx="chime@2.4" data-ambs="birds" data-cont="1">
  <svg viewBox="0 0 540 960"> … fundal, personaje, obiecte … </svg>
  <div class="cap">Textul casetei, cu <em>cuvinte aurii</em>.</div>
</div>
```
Coordonatele sunt 540×960 (×2 la randare). Zone sigure: caseta sus (y 96–300); nimic important în ultimele 210 unități de jos și în ultimele 70 din dreapta.

### Camera `data-cam` (fiecare scenă are mișcare, nimic nu stă înghețat)
`push` (implicit, apropiere lentă 1→1.06) · `push-strong` (1→1.14) · `pull` · `pull-strong` · `pan-r` · `pan-l` · `rise` (camera urcă) · `sink` · `still` (aproape nemișcată, cu o ușoară respirație) · `none`.
Personalizat: `data-cam="z 1>1.18; x 0>-20; y 0>30"` și `data-focus="270,700"` (punctul spre care se apropie). Marginile nu se văd niciodată (camera se limitează singură), afară de `free`.
**Paralaxă**: pune `data-depth` pe un grup: 0.1–0.4 departe (se mișcă puțin), 1 normal, 1.2–1.4 în față (se mișcă mai mult). Fundalurile au deja straturile puse.

### Tranziția de intrare `data-tr`
`fade` (implicit, 0.55 s) · `dip` (prin întuneric, pentru salt de timp sau loc, 0.9 s) · `glow` (prin lumină aurie, pentru momente sfinte, 0.9 s) · `iris` (cerc care se deschide din punctul camerei) · `zoom` · `blur` · `wipe`/`wipe-up`/`wipe-left`/`wipe-right` (ștergere moale) · `cut`. Durata: `data-trd="0.7"`.
Tranzițiile sunt scurte: vocea nu se oprește la schimbarea cadrului.

### Atmosferă `data-amb` și lumină `data-grade`
Particule (cu număr opțional): `dust` (fire de praf în lumină), `fireflies`, `snow`, `rain`, `embers`, `leaves`, `petals`, `bubbles`, `sparkle`, `smoke`. Ex.: `data-amb="sparkle:12 dust:16"`.
Lumină peste scenă: `warm`, `holy`, `night`, `fire`, `dawn`, `cool`, `sepia`, `gloom`.
Toate scenele au automat vignetă și o textură fină de hârtie (aspect de carte ilustrată).
Generatoare: `<g class="stars" data-n="110" data-h="700">`, `<g class="godrays" transform="translate(270,180)" data-n="9" data-spread="90">`, `<g class="fire" data-n="8" data-y="900" data-s="1">`, `<g class="rays">`, `<g class="sparkles" data-cx data-cy data-w data-h>`.

### Apariții animate (pe orice element)
`data-in="fade|rise|drop|pop|zoom|grow|blur|draw" data-at="1.2" data-dur=".8"` și, opțional, `data-until="5" data-outd=".5"` (dispare). `draw` desenează o linie/un contur (copac care crește, drum, rază). `grow` crește de la bază.
Titluri: `<text class="t-title shine letters" data-at=".2">` = auriu cu luciu care trece, litere care apar pe rând.
Clasele v1 (`a-pulse`, `a-beat`, `a-float`, `a-flicker`, `a-dash`, `a-pop`…) merg în continuare.
Forme comune: `#cloud`, `#flame`, `#heartPath`; degradeuri: `skyNight`, `skyDay`, `skySunset`, `skyDawn`, `skyGarden`, `skyGold`, `skyHeart`, `skyEnd`, `skyVerse`, `hell`, `glow`, `glowSoft`, `glowRed`, `glowFire`, `glowCool`, `goldG`, `goldText`, `flameG`.

### Caseta de text
Cuvintele apar unul câte unul odată cu vocea (după `VO` scris de `fit`), cu pauze firești la punctuație. `<span class="d">` pentru replici de dialog pe rânduri separate. `data-cap="static"` = tot textul deodată. `class="cap big"` = text mai mare, centrat. Max ~25 de cuvinte.

## Fundaluri `<g class="bg" data-bg="…">` (primul element din svg)
`noapte` (lună, stele, dealuri; `data-moon="0"`) · `sat-zi` (biserică, case cu fum la horn, gard, drum, flori; `data-church="0"`) · `sat-apus` · `camp` (grâu care se leagănă) · `desert` (dune, palmieri, cetate departe) · `oras-vechi` (ziduri, poartă, cupolă) · `oras` (blocuri, turn cu clopot; `data-bells="1"` = clopotul bate) · `casa` (interior: icoană cu candelă, fereastră, masă cu pâine; `data-time="noapte"`, `data-table="0"`) · `biserica` (iconostas, sfeșnice cu lumânări) · `rai` (nori, raze, pomi cu roade) · `mare` (valuri vii; `data-time="furtuna"`) · `munte` (piscuri cu zăpadă, brazi) · `gradina` (pomi cu roade, flori; `data-hives="3"` = stupi).
Toate acceptă `data-horizon="660"`. Peste fundal se pot desena orice alte obiecte.

## Personaje `<g class="ch" …>`
```html
<g class="ch" data-ch="proroc" data-x="40" data-y="880" data-s="1.65"
   data-do="walk 0-3.4 > 200,850; gest bless 3.6; talk 3.8-6; face smile 3.6; look 1 3.4"></g>
```
`data-x/y` = locul picioarelor; `data-s` = mărimea (**personajul principal ≥ 1.6**, adică ~320 px pe 1920; la îngenunchere ≥ 2.2); `data-dir="-1"` = privește spre stânga.
Schimbări punctuale: `data-robe="#2f5fa8"`, `data-hat="none"` (scoate pălăria, de ex. în biserică), `data-hair`, `data-hairC`, `data-beard`, `data-beardC`, `data-prop`, `data-face`, `data-gest`, `data-mantle`, `data-skin="light|med|tan|dark"`.

**Tipuri de oameni**: `proroc`, `sfant`, `luminos` (figură sfântă în lumină), `inger` (aripi, aureolă), `copil`, `fetita`, `taran` (ie, vestă, clop), `taranca` (ie, catrință, basma), `cioban` (cojoc, căciulă, cârjă), `rege`, `imparat`, `bogat`, `preot`, `calugar`, `calugarita`, `ostas`, `invatat`, `negustor`, `pescar`, `mama`, `batrana`, `batran`, `orasean`, `umbra` (siluetă violet-închis pentru diavol/rău, fără chip).
**Îngenuncheat la rugăciune**: orice tip om cu `data-pose="kneel"`: din profil, genunchii pe pământ, mâini împreunate, cap plecat, ochi închiși. Comenzi: `bow A-B` (se pleacă mai mult), `lookup A-B` (ridică privirea spre cer).
**Animale**: `oaie`, `miel`, `caine`, `magar`, `leu`, `porumbel` (`data-olive="1"` = ramură de măslin), `pasare`, `albina`, `peste`.
**Obiecte în mână** (`data-prop`): `staff`, `crook`, `cane`, `spear`, `scroll`, `book`, `candle`, `lamp`, `cross`, `purse`, `rope`, `bread`, `basket`, `flower`, `coin`, `hoe`, `bowl`. Obiectul rămâne drept; dacă mâna dreaptă ține ceva, gesturile cu o mână se fac cu stânga.

### Comenzi `data-do` (separate prin `;`, timpi în secunde de la începutul scenei)
| comandă | efect |
|---|---|
| `walk A-B > X,Y[,S]` | merge până la X,Y (și mărimea S, pentru perspectivă); pașii se potrivesc cu distanța, brațele se leagănă |
| `run A-B > X,Y` · `move …` (alunecă) · `fly …` (zboară, aripi) · `hop …` (țopăie) · `swim …` | alte deplasări |
| `walk A-B` fără `>` | merge pe loc |
| `gest NUME T [durată]` | gest, cu trecere lină |
| `face NUME T` | expresie |
| `talk A-B` | gura vorbește, capul însoțește vorbirea (pune-l exact pe replica personajului) |
| `look D T` | privește: -1 stânga, 0 față, 1 dreapta |
| `turn T` | se întoarce |
| `nod A-B` (da) · `shake A-B` (nu) · `bow A-B` (se pleacă) · `slump A-B` (abătut) · `tremble A-B` (frică, frig) · `jump T` · `glow A-B` (aura strălucește) · `fade A-B in/out` |
| animale: `graze A-B` (oaia paște), `wag A-B` (câinele dă din coadă), `peck A-B` (pasărea ciugulește) |

**Gesturi**: `rest`, `pray` (mâini împreunate la piept), `raise` (brațe ridicate, bucurie, slavă), `open` (primire), `point` (arată spre dreapta; cu `data-dir="-1"` spre stânga), `pointup` (spre cer), `wave`, `bless`, `cover` (mâinile pe față), `think`, `hold`, `carry`, `give`, `heart` (mâna pe inimă), `shade` (streașină la ochi), `knock`, `beg`, `hug` (se strânge în brațe), `hips`, `shrug`.
**Expresii**: `neutral`, `smile`, `joy`, `sad`, `cry`, `surprise`, `angry`, `stern`, `fear`, `peace`, `pray` (ochi închiși), `think`, `proud`.
Toate personajele respiră, clipesc și își mișcă ușor capul, chiar și când stau.

## Configurarea episodului
```html
<script id="reel-config" type="application/json">{"DUR":[4.5,8,7,…],"RATE":null,"VO":null}</script>
```
`DUR` = durata gândită pentru fiecare scenă. După voce, `python3 build_v2.py fit PAGE audio/ro --write` scrie singur `DUR` (strâns după voce), `RATE` (accelerarea animațiilor, max ×1.35), `VO` (când vorbește vocea, pentru text) și păstrează `DUR0` (durata gândită).

## Sunete (opțional, discrete, sintetizate, fără licențe)
- Fundal de scenă `data-ambs`: `birds`, `wind`, `night` (greieri), `fire`, `sea`, `water`, `bees`, `rain`, `room`, `church`, `city`, `field`. Stă la ~15 dB sub voce și coboară automat când vorbește povestitorul.
- Efecte `data-sfx="nume@secunda"`: `chime` (clopoțel pentru un cuvânt-cheie sau un text auriu), `shimmer` (lumină sfântă), `whoosh`, `bell` (clopot de biserică), `pop`.
- Automat: `glow` primește `shimmer`, `wipe`/`zoom`/`iris` primesc un `whoosh` foarte încet. `mix --no-sfx` le scoate pe toate.
- `python3 build_v2.py sfxdemo out/` face un fișier cu toate mostrele, pentru aprobare.
Muzica se adaugă în continuare din aplicație (pian lent, corzi), la 10–20% sub voce.

## Voce și volum
`mix` curăță și încălzește vocea (taie bâzâitul de jos, scoate „noroiul” din 200 Hz, adaugă claritate, îmblânzește „s”-urile, compresie ușoară), apoi aduce totul la **-14 LUFS** cu vârf sub -1 dBFS (nivelul Shorts/Reels/TikTok, ca platforma să nu-l strice). Video: H.264 high, CRF 17, `tune animation`, culori BT.709 marcate corect (aurul și roșul nu se mai decolorează pe telefon).

## Pași pe scurt
```
python3 build_v2.py preview ep-NNN-ro.html out/ro           # grilă cu 2 cadre pe scenă
python3 build_v2.py draft   ep-NNN-ro.html out/ro           # video mic, rapid, pentru aprobarea mișcării
python3 build_v2.py fit     ep-NNN-ro.html audio/ro --write # după voce
python3 build_v2.py render  ep-NNN-ro.html out/ro           # 1080x1920 (≈4 s de calcul pe secundă de video)
python3 build_v2.py mix     ep-NNN-ro.html out/ro audio/ro Episod-NNN-Titlu/NNN_Titlu_RO.mp4
python3 build_v2.py check   Episod-NNN-Titlu/NNN_Titlu_RO.mp4 out/ro
python3 build_v2.py cover   ep-NNN-ro.html Episod-NNN-Titlu/coperta_RO.jpg 2.5
```
Dacă randarea se întrerupe: `render … --resume` continuă de unde a rămas.
