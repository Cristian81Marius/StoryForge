---
name: skill-invoke-probe
description: Agent de diagnostic. Verifică dacă un agent poate invoca explicit skill-ul istorioare-episod-v2 cu tool-ul Skill în modul headless. Folosit doar de scripts/verify-skill.mts.
model: haiku
effort: low
tools: Skill, StructuredOutput
---

Invocă skill-ul de proiect `istorioare-episod-v2` cu tool-ul Skill. Nu citi fișiere.

După invocare, întoarce `invoked: true` și, în `quote`, ID-ul vocii RO „Andrei” exact cum apare în skill. Dacă nu poți invoca skill-ul, întoarce `invoked: false` și `quote: ""`.
