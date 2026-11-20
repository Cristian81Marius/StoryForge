# StoryForge

Platformă web + worker pentru producția săptămânală de episoade animate scurte (RO + EN), pornind de la „600 de istorioare religioase” de Iosif Trifa. Episoadele se fac cu skill-ul Claude Code `istorioare-episod-v2`, rulat headless prin abonament (fără cheie API Anthropic).

- **Arhitectura și analiza skill-ului:** [`docs/01-analiza-skill.md`](docs/01-analiza-skill.md)
- **Stadiu:** fazele 1–2 (schema DB, state machine, UI de aprobare, worker headless, importul cărții, scenaristul real prin skill). Etapele VIDEO, VOICE, FINAL și SOCIAL rulează deocamdată doar în mod mock.

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
