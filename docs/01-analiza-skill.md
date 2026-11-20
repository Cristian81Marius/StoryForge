# Analiza skill-ului `istorioare-episod-v2` și deciziile de arhitectură

Fișierul analizat: `.claude/skills/istorioare-episod-v2/SKILL.md`. Copia e neschimbată; hash-ul SHA-256 e în `.claude/skills/istorioare-episod-v2.sha256` și se verifică cu `npm run skill:verify`.

## 1. Ce face skill-ul

Skill-ul nu e doar un scenarist. E un pipeline complet, de la textul istorioarei la postare, construit pe **motorul v2**: HTML/JS randat cu Playwright și ffmpeg, **nu Remotion**.

| § | Etapă | Input | Output |
|---|---|---|---|
| 0 | Surse | artifactul „motorul v2” (`engine-v2.js`, `personaje-v2.js`, `fundaluri-v2.js`, `sablon-v2.html`, `build_v2.py`, fonturi), stilul canalului + `voci.json` | `work/pipeline/`, `work/fonts/` |
| 1 | Text | textul lipit de utilizator sau luat de pe comori-od.ro | personaje, loc, învățătură, întrebare, versete |
| 2 | Regie | text | tabel de scene: fundal, personaje + `data-do`, cameră, tranziție, sunet, casetă RO/EN, narațiune RO/EN, `data-cont`; tip A–E; cârlig; reguli de regie |
| 3 | Pagini | tabel | `ep-NNN-ro.html`, `ep-NNN-en.html` (scene + `DUR`) |
| 4 | Aprobare | HTML | `preview_grid.jpg`, `draft.mp4` 540×960; QA vizual; **așteaptă OK** |
| 5 | Voce + video | OK | Speko `audio_synthesize` pe scenă (RO: Cartesia „Andrei”) → `fit` (rescrie `DUR`/`RATE`/`VO` după voce) → `render` 1080×1920 → `mix` (-14 LUFS) → `check` → transcriere de control |
| 6 | Livrare | MP4 | coperți, `postare.md` (titluri, descrieri, hashtag-uri, muzică, ore), zip |
| 7 | Postare | `postare.md` | Metricool `createScheduledPost`, doar după „da” |

## 2. Cum se mapează pe platformă

| Etapa platformei | Cine | Ce din skill |
|---|---|---|
| SCRIPT_DRAFT | agent **scenarist** (opus, xhigh) | §1–§3, plus extragerea storyboard-ului JSON din tabel și HTML (texte copiate literal) |
| VIDEO_DRAFT | worker (`build_v2.py preview`/`draft`), apoi agent **producer** (sonnet, medium) pentru QA și reparații în HTML | §4 |
| VOICE_DRAFT | worker: `TTSProvider` (Speko prin SDK) + `build_v2.py fit` | §5.1–5.3 |
| FINAL_RENDER | worker: `render`, `mix`, `check`, `cover` + outro de brand (atribuirea platformei) | §5.4–5.6, §6 coperți |
| SOCIAL_DRAFT | agent **social** (sonnet, low): convertește `postare.md` în postări pe limbă × platformă | §6 `postare.md` |
| social.schedule | worker: Metricool | §7 |

Principii:
- **Ce e determinist rulează în worker, nu în LLM:** comenzile `build_v2.py` și apelurile TTS. E mai ieftin, reproductibil și nu consumă din abonament.
- **Agenții 2–3 nu rescriu ce a produs skill-ul.** Producer-ul nu atinge textele aprobate. Social-ul structurează `postare.md` și adaugă doar atribuirea, marcajul AI și „made for kids”.
- **Pragurile de aprobare ale skill-ului** („Așteaptă OK-ul”) devin stările `*_REVIEW`. Fiecare rulare `claude -p` execută doar secțiunile etapei ei.

## 3. Pipeline-ul (ajustat)

```
NEW → SCRIPT_DRAFT → SCRIPT_REVIEW → VIDEO_DRAFT → VIDEO_REVIEW → VOICE_DRAFT → VOICE_REVIEW
    → FINAL_RENDER → FINAL_REVIEW → SOCIAL_DRAFT → SOCIAL_REVIEW → SCHEDULED → PUBLISHED
```

Față de specificația inițială, **randarea finală 1080p vine după voce** (FINAL_RENDER/FINAL_REVIEW), pentru că `fit` recalculează duratele scenelor după narațiune. Orice randare finală făcută înainte de voce ar trebui refăcută.

## 4. Storyboard-ul (schema Zod)

`packages/core/src/schemas/storyboard.ts`: reprezentarea **neutră față de motor**.
- Câmpurile din tabelul skill-ului: scene (fundal, personaje + acțiuni, cameră, tranziție, ambianță, casetă, narațiune, durată, `continues`), titlu, cârlig, întrebare, verset.
- Câmpurile cerute de platformă: morală într-o singură frază, public țintă, rezumat, `authorTeaching` (pentru verificarea fidelității), personaje cu descriere vizuală consecventă și `originalName` când numele e schimbat.
- `render.provider` + `render.files`: fișierele native ale motorului care a produs episodul.
- Validări luate din regulile skill-ului: titlu primul, final ultimul, scenă de învățătură obligatorie, camera nu se repetă în scene consecutive, caseta are cel mult ~30 de cuvinte.
- **Numărul de scene:** 5–12 scene de poveste plus învățătură. Ai cerut 5–10, dar episodul 2 din skill („Albinele și fumul”) are 12 scene, iar skill-ul spune „durata vine din poveste”. Limita e o constantă (`SCENE_LIMITS`) și se poate strânge.
- **Durata:** 20–150 s, ca verificare de bun-simț. Skill-ul spune 40–100 s, iar specificația 60–120 s. N-am impus intervalul tău strict, ca să nu taie povești, cum cere skill-ul.

## 5. Schimbarea tematicii sau a motorului

Configurabile **pe carte** (`Book`): `skillName`, `attributionRo/En` (șabloane cu `{author} {number} {title} {book}`), `animationProvider`, `ttsProvider`. Un alt conținut înseamnă o altă carte cu alt skill. Un conector de animații înseamnă alt `animationProvider` (interfață în faza 3), care consumă același storyboard.

## 6. Atribuirea (ambele forme)

- Platforma: „După o istorioară de Iosif Trifa · Istorioara nr. {nr} «{titlu}» · 600 de istorioare religioase” (EN: „Based on a story by Iosif Trifa · Story no. …”). Apare în outro și în fiecare descriere.
- Skill-ul: cartela lui finală („Istorioara nr. X · 600 de istorioare religioase · Pr. Iosif Trifa”) și sursa din `postare.md` rămân neschimbate.
- `hasRequiredAttribution()` verifică fraza obligatorie și numărul înainte de programare.

## 7. Dependențele skill-ului pe un worker local

| Skill-ul presupune | Pe worker |
|---|---|
| motorul v2 citit din artifactul claude.ai | copie neschimbată în `vendor/trifa-v2/` (faza 2–3). Workerul local n-are acces la artifacte. |
| Speko și Metricool prin MCP | Speko prin SDK `@spekoai/sdk` (cheie API, criptată în DB); Metricool, vezi §8 |
| python3, ffmpeg, Playwright/Chromium, Pillow, numpy | de instalat pe Windows (README) |
| conversație interactivă | `claude -p`: agenții primesc input dintr-un fișier JSON și nu cer confirmări |

## 8. Ce am verificat

| Întrebare | Rezultat |
|---|---|
| `claude -p --output-format json`: usage | `total_cost_usd`, `usage` (input/output/cache), `modelUsage` (camelCase în CLI, inclusiv subagenții), `duration_ms`, `duration_api_ms`, `num_turns`, `session_id`, `is_error`, `subtype`. Pe abonament, costul e o **estimare** locală, nu o factură. |
| `--json-schema` | funcționează și pune rezultatul în `structured_output`. **Capcană găsită:** dacă agentul are `tools:` în frontmatter, trebuie inclus `StructuredOutput`, altfel `structured_output` lipsește. Testul `apps/worker/test/agents.test.ts` previne regresia. |
| `skills` în frontmatter, în headless | **NU** preîncarcă skill-ul la `claude -p --agent` (v2.1.329, testat). **Invocarea explicită cu tool-ul Skill funcționează**, deci toți agenții o fac ca prim pas. Verificare: `npm run skill:verify`. |
| `effort` în frontmatter | câmp valid (`low`…`max`) |
| Speko | are API documentat și SDK TS (`speko.synthesize`, cheie `sk_…`). Parametrii de voce/provider, de verificat în faza 4. |
| Metricool API | doar pe planurile Advanced și Custom. **Pe Free nu există API.** MCP-ul merge pe Free, cu limitele planului: 1 brand, 20 de postări pe lună. |
| Claude Pro | `claude -p` merge cu login de abonament (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`). Există limită la 5 h și limită săptămânală, comune cu claude.ai. La limită, workerul pune jobul în `WAITING_LIMIT` și îl reia automat. |
