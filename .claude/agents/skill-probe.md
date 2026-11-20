---
name: skill-probe
description: Agent de diagnostic. Verifică dacă `skills` din frontmatter preîncarcă skill-ul în modul headless (claude -p --agent). Folosit doar de scripts/verify-skill.mts.
model: haiku
effort: low
skills:
  - istorioare-episod-v2
tools: Read, StructuredOutput
---

Răspunde doar din contextul tău, fără să folosești vreun tool.

Dacă în contextul tău se află deja conținutul skill-ului `istorioare-episod-v2`, întoarce `preloaded: true` și, în `quote`, ID-ul vocii RO „Andrei” exact cum apare în skill.

Dacă nu ai skill-ul în context, întoarce `preloaded: false` și `quote: ""`. Nu ghici.
