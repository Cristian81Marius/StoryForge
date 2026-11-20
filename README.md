# StoryForge

Platformă web + worker pentru producția săptămânală de episoade animate scurte (RO + EN), pornind de la „600 de istorioare religioase” de Iosif Trifa. Episoadele se fac cu skill-ul Claude Code `istorioare-episod-v2`, rulat headless prin abonament (fără cheie API Anthropic).

- **Arhitectura și analiza skill-ului:** [`docs/01-analiza-skill.md`](docs/01-analiza-skill.md)
- **Stadiu:** fazele 1–6 (schema DB, state machine, UI de aprobare, worker headless, importul cărții, scenaristul real prin skill). Toate etapele au implementare reală. Modul mock (`STORYFORGE_MOCK_AGENTS=1`) rămâne pentru demo și teste.

## Video (faza 3)

Workerul rulează comenzile motorului v2 exact ca în skill (`build_v2.py preview / draft / render / mix / check / cover`), din `work/ep-NNN/pipeline/`.

- **VIDEO_DRAFT:** pentru RO și EN: preview (grila cu 2 cadre pe scenă) → agentul **producer** face QA vizual și repară pagina, fără să schimbe textele aprobate → preview refăcut → `draft.mp4` 540×960, fără voce. În review vezi grilele, draftul și problemele găsite.
- **FINAL_RENDER:** randare 1080×1920 → mixaj (doar dacă vocea există, după faza 4) → **outro de brand** cu atribuirea obligatorie, lipit după cartela finală a skill-ului → `check` (rezoluție, codec, BT.709, -14 LUFS, vârf, tăceri) → copertă. În review vezi video-ul final, coperta și raportul de verificare.
- **Outro-ul** e o pagină a aceluiași motor (aceleași fonturi și culori), generată din **Setări → Template video**: nume canal, slogan RO/EN, culoare, logo, durată. Nu am folosit Remotion: ar fi adăugat sute de MB de dependențe pentru câteva secunde de video.
- **Storage:** `STORAGE_DRIVER=local` (implicit, în `STORAGE_DIR`) sau `s3` (S3/R2/MinIO). Fișierele se servesc doar adminului, prin `/api/files/...`, cu suport de derulare.

### Cerințe pentru randare (pe calculatorul cu workerul)

```bash
pip install playwright pillow numpy
```

```bash
python -m playwright install chromium
```

Plus `ffmpeg` și `ffprobe` în PATH. Verificare rapidă (randează un outro de test):

```bash
npm run test -w @storyforge/worker
```

**Windows, de verificat la prima rulare:** `build_v2.py` deschide paginile cu `'file://' + cale` și caută Chrome doar în căi Linux, deci pe Windows folosește Chromium-ul Playwright. Dacă testul de randare pică pe Windows, trimite-mi eroarea. Motorul nu se modifică în repo, corecția se face în artifactul motorului v2, cum prevede skill-ul.

## Importul cărții (faza 2)

Pagina **Import** din aplicație. Se importă DOAR textul istorioarelor; prefața, notele, ilustrațiile și adăugirile editoriale nu se folosesc. Nimic nu intră în coadă fără confirmarea ta, după previzualizare.

- **Din fișier** (TXT, DOCX, PDF): fiecare istorioară începe cu un rând „Număr. Titlu”. Textul dinaintea primei istorioare (prefața) e ignorat și afișat separat.
- **De pe comori-od.ro** (sursa folosită și de skill): jobul `book.import.comori` din worker descarcă secvențial, cu pauze și reîncercări (site-ul răspunde cu HTTP 500 la prea multe cereri). Paginile rămân în `work/cache/comori/`, așa că o reluare descarcă doar ce lipsește. De pe site se iau doar rândurile textului, inclusiv trimiterile autorului de tip „(Mt 7, 24)”. Nu se iau versetele adăugate de site, tag-urile sau prefețele.
- **Din linia de comandă:** `npm run import:comori` (opțional `-- --limit 20`).

Previzualizarea arată numerele lipsă, duplicatele, textele goale sau suspecte (posibile note și prefețe) și permite excluderea fiecărei istorioare. Dacă există probleme, confirmarea cere bifa „confirm oricum”. Poveștile deja intrate în producție nu sunt modificate de un import nou.

După demo, butonul „Șterge datele demo” din pagina Import elimină poveștile `[MOCK]`.

Dacă rețeaua ta trece printr-un proxy HTTP, pornește workerul cu `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21), ca `fetch` să folosească `HTTPS_PROXY`.

## Structură

```
apps/web          Next.js (App Router): dashboard, pagina poveștii, aprobări, diff, calendar, usage, setări
apps/worker       Node: polling pe Job, rulează `claude -p --agent …`, salvează versiuni și usage (Run)
packages/core     state machine, scheme Zod, criptare AES-GCM, logger cu redactare, servicii DB
prisma/           schema + migrații + seed mock
.claude/agents    scenarist (opus/xhigh), producer (sonnet/medium), social (sonnet/low) + 2 agenți de diagnostic
.claude/skills    istorioare-episod-v2 (furnizat de utilizator; NU se modifică)
fixtures/         storyboard de test
```

## Setup local

Cerințe: Node 22+, PostgreSQL 16, Claude Code CLI autentificat cu abonamentul. Pentru fazele 3+ mai trebuie Python 3, ffmpeg și Chromium.

```bash
npm install
```

```bash
cp .env.example .env
```

Completează `.env` (vezi tabelul de mai jos). Generează hash-ul parolei de admin:

```bash
npm run -s hash-password -w @storyforge/web -- 'parola-ta'
```

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Aplicația: http://localhost:3000. Workerul, în alt terminal:

```bash
npm run worker
```

Verifică, o singură dată, că agenții au acces la skill (consumă foarte puțin, un apel haiku):

```bash
npm run skill:verify
```

### Demo faza 1 (fără consum din abonament)

```bash
npm run demo
```

Pornește prima poveste din coadă, cere modificări pe una în review și rulează workerul în mod mock (`STORYFORGE_MOCK_AGENTS=1`). Apoi deschide dashboard-ul.

## Variabile de mediu

| Variabilă | Rol |
|---|---|
| `DATABASE_URL` | Postgres |
| `STORYFORGE_ENC_KEY` | cheia AES-256-GCM pentru token-urile integrărilor (32 de octeți, base64) |
| `ADMIN_USER`, `ADMIN_PASSWORD_HASH` | utilizatorul admin; hash scrypt, nu parola |
| `SESSION_SECRET` | semnează cookie-ul de sesiune (min. 32 de caractere) |
| `S3_*` | storage S3-compatibil pentru video și audio (fazele 3+) |
| `WORKER_ID`, `WORKER_POLL_MS` | identificator și interval de polling |
| `CLAUDE_BIN` | calea către `claude`. Pe Windows dă calea completă către `claude.exe`: workerul pornește procesul fără shell, deci un `claude.cmd` nu merge. |
| `CLAUDE_CODE_OAUTH_TOKEN` | token de abonament pentru rulări fără browser (`claude setup-token`). Pune-l în mediul serviciului, nu în repo. |
| `WORK_DIR` | directorul de lucru al episoadelor |
| `STORYFORGE_MOCK_AGENTS` | `1` = agenți simulați (demo și teste) |

Nicio parolă de rețea socială nu se stochează. Integrările folosesc doar token-uri API, criptate în DB. Conectarea rețelelor se face în Metricool, de către tine.

## Teste

```bash
npm test
```

Testele unit acoperă state machine-ul, validatoarele, criptarea, redactarea, runner-ul headless (inclusiv reîncercarea unică la JSON invalid și limita abonamentului) și frontmatter-ul agenților.

```bash
npm run test:e2e
```

Testele e2e (Playwright) acoperă fluxul de aprobare pe baza `storyforge_test`: build, start, seed mock, login, cere modificări, re-rulare cu feedback, aprobare, respingere, coadă.

## Voce (faza 4)

- **Speko** (implicit): câte un apel `synthesize` pe scenă, cum cere skill-ul §5.2. Limba e cea a scenei, cu `optimizeFor: accuracy`, vocea din `voci.json` (RO: Cartesia „Andrei”) sau din **Setări → Integrări → Speko**, iar providerul TTS e restricționat la cel al vocii. Urmează `build_v2.py fit --write` (DUR / RATE / VO după voce) și draftul cu voce. Pronunția se verifică prin transcrierea scenei celei mai lungi (§5.6). Costul se calculează din diferența de credit Speko și apare la Usage.
- **Upload manual** (alternativă): în Setări → Surse, alege „upload manual”. În pagina poveștii (VOICE_DRAFT) încarci câte un fișier audio pe scenă și limbă, apoi apeși „Reîncearcă”.
- **Vocea EN** nu e aprobată încă în `voci.json`. Până o setezi, routerul alege o voce, iar review-ul afișează un avertisment.
- **Muzică de fundal** opțională (Setări → Template video): ducking sub voce, apoi re-normalizare la -14 LUFS. Implicit e oprită. Skill-ul recomandă muzica din bibliotecile platformelor.

## Social și Metricool (faza 5)

- **SOCIAL_DRAFT:** agentul social scrie `postare.md` după skill §6 și îl structurează pe limbă × platformă. Workerul garantează atribuirea în fiecare descriere și propune orele după **Setări → Ritm** (zile și oră de postare), în fusul orar al fiecărui canal.
- **După aprobare** (`social.schedule`), postările intră în **Calendar**. Modul de programare se alege în Setări → Integrări → Metricool:
  - `manual` (implicit): calendarul arată textul de copiat; tu postezi din Metricool sau din aplicații, apoi apeși „Am postat”.
  - `mcp` (merge pe **planul Free**): agentul `publisher` apelează `createScheduledPost` din MCP-ul Metricool. Pe calculatorul cu workerul, conectează o dată MCP-ul în Claude Code (`claude mcp add …`, apoi `/mcp` pentru autentificare). Dacă serverul nu se numește `metricool`, setează `METRICOOL_MCP_SERVER`.
  - `api` (planurile Advanced / Custom): `POST /api/v2/scheduler/posts` cu token-ul criptat.
- **Media publică:** Metricool cere video-ul la un URL public care nu expiră. Completează „URL public pentru media” (de exemplu un bucket R2 public sau `STORAGE_DRIVER=s3` cu acces public la citire). Fără el, programarea trece automat pe `manual`.
- **Planul Free:** un singur brand și 20 de postări pe lună. Setează limita în integrare; peste ea, postările trec pe manual. RO și EN pe același brand înseamnă aceleași conturi de rețea.
- **Marcaje:** `isAiGeneratedContent` (YouTube), `isAigc` (TikTok), `isAiGenerated` (Instagram) și `madeForKids` (YouTube) se trimit în fiecare postare.
- **Conexiuni expirate:** verificare zilnică (API: `simpleProfiles`; MCP: `getBrandSettings`), afișată în Dashboard, Calendar și Setări.
- **Mutarea** unei postări din Calendar o reprogramează și în Metricool.

## Usage și planificare (faza 6)

- **Usage:** costul echivalent pe săptămână și lună, grafic pe 12 săptămâni cu pragul, defalcări pe agent / model / effort, etapă, poveste și lună, ultimele rulări (tokens, cost, durată, exit, validare) și costurile serviciilor externe. Depășirea pragurilor apare în Dashboard și Usage și trimite un email, o singură dată pe perioadă.
- **Cron în worker** (la fiecare minut; `WORKER_CRON=0` îl oprește):
  - în zilele și la ora din **Setări → Ritm**, pornește SCRIPT_DRAFT pentru următoarele povești din coadă, cel mult `storiesPerWeek` pe săptămână. O poveste produce ambele limbi, deci servește toate canalele;
  - email „aștept aprobarea ta” pentru fiecare versiune nouă intrată în review;
  - trecerea SCHEDULED → PUBLISHED după ora ultimei postări;
  - verificarea zilnică a conexiunilor Metricool.

  Fiecare acțiune e unică prin `CronRun`, deci repornirile nu o dublează.
- **Email:** prin Resend (token API, nu parolă SMTP). Completează expeditorul de pe un domeniu verificat și destinatarul în Setări → Integrări → Email. Linkurile din email folosesc `APP_URL`.

## Workerul ca serviciu Windows

Workerul trebuie să ruleze **ca utilizatorul tău Windows**, nu ca LocalSystem: credențialele Claude Code stau în `%USERPROFILE%\.claude`. Varianta recomandată e [NSSM](https://nssm.cc/).

1. Generează un token de abonament, o singură dată:

```powershell
claude setup-token
```

2. Instalează serviciul (din folderul repo-ului, PowerShell ca administrator):

```powershell
nssm install StoryForgeWorker "C:\Program Files\nodejs\node.exe" "--env-file=.env --import tsx apps\worker\src\index.ts"
```

```powershell
nssm set StoryForgeWorker AppDirectory "C:\cale\catre\storyforge"
```

```powershell
nssm set StoryForgeWorker AppEnvironmentExtra "CLAUDE_CODE_OAUTH_TOKEN=<token>" "CLAUDE_BIN=C:\Users\<tu>\.local\bin\claude.exe"
```

```powershell
nssm set StoryForgeWorker ObjectName ".\<utilizatorul-tau>" "<parola-windows>"
```

```powershell
nssm set StoryForgeWorker AppStdout "C:\cale\catre\storyforge\work\worker.log"
```

```powershell
nssm set StoryForgeWorker AppStderr "C:\cale\catre\storyforge\work\worker.err.log"
```

```powershell
nssm start StoryForgeWorker
```

Parola Windows de la `ObjectName` e cerută de Windows pentru a rula serviciul sub contul tău. O stochează Windows (LSA), nu StoryForge.

Workerul se oprește curat la SIGINT/SIGTERM. Joburile rămase `RUNNING` după o oprire bruscă sunt repuse în coadă la pornire.

## Limite de știut

- **Claude Pro:** limită la 5 ore și limită săptămânală, comune cu claude.ai. La limită, jobul trece în `WAITING_LIMIT` și se reia automat; costul afișat e echivalent API, nu factură.
- **Metricool Free:** fără API; MCP cu 1 brand și 20 de postări pe lună. Se decide în faza 5.
