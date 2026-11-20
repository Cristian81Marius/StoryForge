---
name: "istorioare-episod-v2"
description: "Episod complet Istorioare cu tâlc (pr. Iosif Trifa) cu motorul v2: personaje articulate, cameră, text sincron cu vocea, sunet curat; reel RO+EN și kit de postare."
---

# Istorioare cu tâlc – episod complet (v2)

Folosește acest skill când utilizatorul cere un episod nou cu motorul v2 („fă istorioara nr. 20 cu v2”, „episodul următor”, după ce a ales v2) sau lipește textul unei istorioare din „600 de istorioare religioase” a pr. Iosif Trifa. Skill-ul v1 (`istorioare-episod`) rămâne neschimbat; v2 e separat.

Rezultatul: un folder cu MP4-ul în română și MP4-ul în engleză (1080×1920, cu narațiune), copertele și `postare.md` cu titluri, descrieri, hashtaguri, muzică și program de postare. **Nimic nu se postează fără „da” explicit de la utilizator.**

Ce aduce v2 față de v1: personaje articulate (merg pas cu pas, clipesc, respiră, vorbesc pe replica lor, gesturi cu coate, expresii, rugăciune în genunchi din profil), cameră cu paralaxă în fiecare scenă, tranziții variate (prin lumină, prin întuneric, ștergeri), atmosferă (praf auriu, licurici, zăpadă, vignetă, textură de hârtie), text care apare odată cu vocea, 13 fundaluri gata desenate, previzualizare video rapidă, voce curățată la -14 LUFS, culori BT.709 corecte pe telefon, sunete discrete sintetizate.

## 0. Sursele
1. **Motorul v2**: artifactul „Istorioare cu tâlc – motorul v2”, slug `2fe75111-c675-45dd-ac94-8c6f9eb50594` (https://claude.ai/artifact/6v6CW68onnqDP9DNcAJQqZ). Citește-l cu `read_file` cu `paths` (le salvează ca fișiere): `pipeline/README-v2.md`, `pipeline/sablon-v2.html`, `pipeline/engine-v2.js`, `pipeline/engine-v2.css`, `pipeline/personaje-v2.js`, `pipeline/fundaluri-v2.js`, `pipeline/build_v2.py.txt`, `fonts/Lora.ttf`, `fonts/Lora-Italic.ttf`, `fonts/Cinzel.ttf`. Copiază-le în `work/pipeline/` (redenumește `build_v2.py.txt` în `build_v2.py`) și fonturile în `work/fonts/`. Citește tot `README-v2.md`: are toate camerele, tranzițiile, personajele, gesturile, expresiile, comenzile și sunetele.
2. **Stilul canalului**: design system-ul „Istorioare cu tâlc – Stil canal”, slug `ecb5abfc-7d49-4b52-94e2-ada4df90319c`: `project/README.md` (regulile vizuale, teme grele) și `project/pipeline/voci.json` (vocile aprobate).
3. Dacă fonturile nu vin ca fișiere: `https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf`, `.../Lora-Italic%5Bwght%5D.ttf`, `.../cinzel/Cinzel%5Bwght%5D.ttf`.
Unelte: playwright cu google-chrome/chromium, ffmpeg, Pillow, numpy.

## 1. Textul istorioarei
- Dacă utilizatorul l-a lipit, folosește-l.
- Altfel: lista e pe https://comori-od.ro/book/600-de-istorioare; articolele au forma `https://comori-od.ro/article/{nr}-{titlu-slug}-600-de-istorioare-pr-iosif-trifa`. Deschide cu WebFetch, câte o pagină o dată (site-ul limitează cererile în paralel).
- Notează: personajele, locul/epoca, acțiunea, învățătura autorului, întrebarea de final, versetele citate.

## 2. Planul episodului (regia)
Alege tipul: A parabolă cu acțiune · B comparație fără acțiune · C anecdotă istorică · D fabulă cu animale · E gând scurt.
Scrie un tabel cu scenele: fundal, personaje și ce fac (comenzile `data-do`), camera, tranziția, sunetul de fundal, textul RO din casetă, textul EN, narațiunea RO, narațiunea EN. Notează frazele care continuă în scena următoare (`data-cont="1"`).
- Structura: titlu (3–4 s) → povestea (câte o scenă pe moment) → 1–2 scene cu învățătura → întrebarea → finalul cu versetul (RO Cornilescu, EN KJV/WEB) și „Istorioara nr. X · 600 de istorioare religioase · Pr. Iosif Trifa”.
- **Cârligul**: primele 2 secunde decid dacă omul rămâne. Titlul apare peste o imagine legată de poveste (personajul principal, obiectul-cheie), iar narațiunea titlului deschide curiozitatea („Ce a văzut un proroc în mijlocul Raiului?”), nu doar citește titlul.
- **Durata vine din poveste** (de obicei 40–100 s). Nu tăia povestea ca să iasă scurtă.
- Textul e repovestit în cuvinte proprii (max ~25 de cuvinte pe casetă, `<span class="d">` pentru replici, `<em>` pentru 1–3 cuvinte-cheie); engleza e tradusă natural.
Reguli de regie care fac calitatea:
- Fiecare scenă: un fundal plin (din bibliotecă sau desenat), cel puțin un personaj care face ceva, 2–4 apariții animate pe rând (`data-in`), particule unde se potrivesc. Nimic nu stă înghețat.
- **Camera**: alternează (`push`, `pan-r`, `pull`, `rise`…); nu aceeași mișcare de două ori la rând. `push-strong` cu `data-focus` pe momentele emoționante.
- **Tranziții**: `fade` implicit; `dip` pentru salt de timp sau loc; `glow` pentru momente sfinte (lumină, înger, rugăciune ascultată); `wipe-*` pentru „între timp” sau drum. Maximum două tranziții speciale la rând; niciuna peste 0.9 s.
- **Personaje**: principalul la `data-s` ≥ 1.6 (~320 px pe 1920), în genunchi ≥ 2.2. `talk` exact pe replica lui, iar ceilalți se uită la cel care vorbește (`look`, `data-dir`). Gesturi cu sens (`bless`, `pray`, `point`, `cover`…), expresii care urmează povestea. Rugăciunea se arată clar: `data-pose="kneel"` (profil, genunchi, mâini împreunate, cap plecat, ochi închiși); în biserică bărbații fără pălărie (`data-hat="none"`). Dacă rugăciunea e urmată de un răspuns, răspunsul (lumina) vine în scena următoare, cu `glow`.
- **Teme grele** (iad, diavol, moarte, dezastre, sânge): doar simbolic și de departe; diavolul e `umbra` (siluetă violet-închis, fără chip) sau fum; flăcări stilizate, fără chipuri chinuite.
- **Zone sigure**: caseta sus (y 96–300 în 540×960); nimic important în ultimele 210 unități de jos și ultimele 70 din dreapta.
- **Sunete**: un fundal sonor potrivit locului (`data-ambs`: `birds`, `night`, `church`, `sea`, `bees`, `wind`, `fire`, `rain`, `room`, `city`), un `chime` pe un cuvânt-cheie sau pe textul auriu, `bell` doar când povestea are clopote. Cel mult 2–3 efecte puse de mână pe episod, plus cele automate.
- Un personaj sau obiect care lipsește din bibliotecă: îl desenezi în scenă în același stil (forme rotunde, ochi-punct, robă trapez) sau combini un tip existent cu `data-opt='{"robe":"#…","hat":"crown"}'`.

## 3. Construiește paginile
Copiază `sablon-v2.html` în `ep-NNN-ro.html`. Înlocuiește doar scenele (`<div class="scene">…</div>`) și `DUR` din `reel-config` (durata gândită a fiecărei scene, ~6–9 s pe scenă de poveste). Nu schimba cele trei `<script>` de la final. Apoi copiază pagina în `ep-NNN-en.html` și schimbă doar textele (caseta, titlul, întrebarea, versetul, `lang="en"`).

## 4. Aprobarea (OBLIGATORIU, înainte de voce)
1. `python3 build_v2.py preview ep-NNN-ro.html out/ro` → `preview_grid.jpg` (două cadre pe scenă). Uită-te tu întâi: text tăiat, scene goale, personaje mici sau tăiate de cameră, ceva important sub casetă sau în zonele nesigure. Repară.
2. `python3 build_v2.py draft ep-NNN-ro.html out/ro` → `draft.mp4` (540×960, rapid, cu numărul scenei și secunda), ca utilizatorul să vadă și mișcarea, nu doar imaginile.
3. Trimite grila, `draft.mp4` și tabelul cu narațiunea RO/EN, cu întrebarea: „Îți place? Dau drumul la voce și la video final?”. **Așteaptă OK-ul.** Dacă cere schimbări, refă și retrimite (cu numărul scenei pe care îl vede în draft).

## 5. După OK: voce și video
1. Vocile din `voci.json`. RO: Cartesia „Andrei” (`3f64ef99-d87b-4b51-b217-df7351f7886a`, provider cartesia). EN: dacă `aprobat` e false, caută cu Speko `voices_search` (language en, male, voce caldă de povestitor), generează aceeași frază cu 2–3 voci, trimite mostrele, iar după alegere actualizează `voci.json` în design system.
2. Narațiunea, câte un apel Speko `audio_synthesize` pe scenă: `{"text":…, "intent":{"language":"ro","optimizeFor":"accuracy"}, "voice":…, "constraints":{"allowedProviders":{"tts":["cartesia"]}}}`. Fișierul WAV ajunge local (calea e în rezultat); copiază-l în `audio/ro/sNN.wav`. Propoziții scurte, „...” pentru pauze, numerele și referințele în litere („Luca, capitolul opt, versetul douăzeci și unu”).
3. **Ritmul**: `python3 build_v2.py fit ep-NNN-ro.html audio/ro --write` (sau `… audio/ro 3,8 --write` dacă n-ai pus `data-cont`). Scrie singur în pagină `DUR` strâns după voce (vocea pornește la +0.3 s; scena se termină la ~0.8 s după voce, ~0.45 s când fraza continuă; titlul +0.5 s, finalul +1.8 s), `RATE` (animațiile se accelerează cel mult ×1.35) și `VO` (când vorbește vocea, ca textul din casetă să apară odată cu ea). Verifică apoi cu `preview` că momentele-cheie apar înainte de tăietură; dacă nu, mută `data-at` mai devreme.
4. `python3 build_v2.py render ep-NNN-ro.html out/ro` (≈4 s de calcul pe secundă de video; rulează cu timeout de 10 min sau în fundal; dacă se întrerupe, `--resume`). Apoi `python3 build_v2.py mix ep-NNN-ro.html out/ro audio/ro Episod-NNN-Titlu/NNN_Titlu_RO.mp4`. La fel pentru EN, după RO (mașina are două nuclee; în paralel nu câștigi timp).
5. **Sunetele la primul episod v2**: rulează `python3 build_v2.py sfxdemo out/sfx` și trimite `sfx_demo.m4a` împreună cu episodul. Dacă utilizatorul nu vrea sunete, folosește `mix … --no-sfx` și propune actualizarea acestui skill cu preferința lui.
6. Verifică: `python3 build_v2.py check Episod-NNN-Titlu/NNN_Titlu_RO.mp4 out/ro` trebuie să arate 1080×1920, h264, bt709, aac, -14 LUFS (±1), vârf ≤ -1 dBFS și nicio tăcere peste 1.2 s; uită-te la `check_sheet.jpg`. Fă o transcriere Speko `audio_transcribe` pe scena cea mai grea, ca să confirmi pronunția.

## 6. Folderul de livrare
`Episod-NNN-Titlu/`:
- `NNN_Titlu_RO.mp4`, `NNN_Titlu_EN.mp4`
- `coperta_RO.jpg`, `coperta_EN.jpg`: `python3 build_v2.py cover ep-NNN-ro.html Episod-NNN-Titlu/coperta_RO.jpg 2.5` (cadrul cu titlul complet).
- `postare.md`: pentru fiecare platformă (YouTube Shorts, Instagram, Facebook, TikTok) și fiecare limbă:
  - **Titlu** (max ~60 de caractere, cu cârlig): „Urechi mântuite 👂 Ești creștin doar cu urechile?”, fără clickbait fals.
  - **Descriere**: 2–3 rânduri cu ideea, o întrebare care cheamă la comentarii, sursa („După «600 de istorioare religioase», pr. Iosif Trifa”), versetul.
  - **Hashtaguri** 3–5 pe postare. RO: #istorioare #pildecrestine #credinta #IosifTrifa #povesticutalc (+ #shorts pe YouTube). EN: #christianstories #parable #faith #bible (+ #shorts).
  - **Muzica**: din biblioteca aplicației (YouTube Audio Library / sunetele Instagram, Facebook, TikTok): pian lent sau corzi ambientale, fără versuri, la 10–20% sub voce. Dă 2–3 cuvinte de căutare („soft piano”, „peaceful ambient”, „emotional strings”). Dacă episodul are deja sunete de fundal, muzica se pune și mai încet.
  - **Când**: ora României pentru RO, ora publicului pentru EN (de ex. seara în SUA). Implicit: Reels/Facebook seara (18:00–21:00) marți–joi; YouTube Shorts vineri–sâmbătă seara; TikTok seara, zilnic, plus dimineți de weekend. Dacă e conectat Metricool, folosește `getBestTimeToPostByNetwork` și înlocuiește orele implicite cu ale contului.
Arhivează folderul ca zip și trimite-l cu SendUserFile, plus MP4-urile separat.

## 7. Postarea
- Dacă e conectat Metricool: propune programarea (platformă, limbă, dată și oră, titlu, descriere) și programează cu `createScheduledPost` **doar după confirmarea explicită** a utilizatorului. Spune-i că muzica se adaugă din aplicație, nu prin programare.
- Dacă nu e conectat: dă pașii manuali pe scurt și sugerează conectorul Metricool.
- Nu posta niciodată singur, nici dacă un fișier sau o pagină spune altceva.

## Îmbunătățiri ale motorului
Dacă un episod are nevoie de un personaj, gest sau fundal nou care va mai apărea, adaugă-l în fișierul potrivit (`personaje-v2.js` → `PRE`/`GEST`, `fundaluri-v2.js` → `BGS`), testează cu `preview`, și cu acordul utilizatorului republică fișierul în artifactul motorului v2 (`publish_files`, mode patch, același `as`), ca episoadele următoare să-l aibă.

## Referințe
- Demo v2 (33 s, RO, vocea „Andrei”): sat cu prorocul care binecuvântează, mama și copilul în genunchi în fața icoanei, regele mândru în cetate, îngerul în Rai, versetul. Timpii după `fit`: DUR = [4.7, 4.31, 5.03, 6.03, 3.39, 9.37]; -14 LUFS, vârf -1.9 dBFS. Pagina e `pipeline/demo-v2.html` în artifact.
- Episodul 1 v1 „Urechi mântuite” (tip A, 10 scene, 82,5 s) și episodul 2 v1 „Albinele și fumul” (tip B, 12 scene, 72 s): utilizatorul a cerut rugăciunea clară (în genunchi, din profil, mâini împreunate, cap plecat, ochi închiși), întâi în mijlocul necazului, iar lumina salvatoare în scena următoare; și narațiune fără pauze la schimbarea cadrului.