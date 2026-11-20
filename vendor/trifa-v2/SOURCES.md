# vendor/trifa-v2: copii NESCHIMBATE ale resurselor skill-ului

Skill-ul `istorioare-episod-v2` (§0) citește aceste fișiere din artifacte claude.ai, la care workerul local nu are acces. Aici sunt copiile lor exacte, preluate pe 2026-11-20. **Nu se editează în repo.** Dacă motorul se îmbunătățește (skill-ul permite republicarea în artifact), se re-copiază întregul folder și se actualizează hash-urile de mai jos.

## motor/ ← „Istorioare cu tâlc – motorul v2”
https://claude.ai/artifact/6v6CW68onnqDP9DNcAJQqZ (versiunea 1795117753-b2f3)

| fișier | sha256 |
|---|---|
| pipeline/README-v2.md | 447277ee30e6f90be97ad17e4a091e47f4530fac7cf8c8d8a78ee95b1939de74 |
| pipeline/sablon-v2.html | faa451f56cca42ae3ea1f0ca72c88de760f98526598fe2490671082931ca1ea0 |
| pipeline/engine-v2.js | dacad62b4e3968df9a967d54abdbd59a627060cc36f19e3b8a35f5a35e1e89be |
| pipeline/engine-v2.css | 471c8b546a6ba893ce98a922c7dce62f29bc0b230e25ec3f57c7d2ac8b19adb6 |
| pipeline/personaje-v2.js | 0beeb789f86f674f9c546c37a24a934a0af33c972a828c9e979d6de1398c3637 |
| pipeline/fundaluri-v2.js | fe0929e17eb2801664908cd760cbb68ea1122a504c713db4e4ee2cc4de9afa40 |
| pipeline/build_v2.py.txt | dbc78119f5dffbfcc78e10a0946d56be4421f17ee4679e2a695cf228169dab9c |
| pipeline/demo-v2.html | 6699932ef2b94b25deaeaeea6618c0381adf68fe8e096c1b37737ebf1df97002 |
| pipeline/fundaluri-demo.html | cfc45ffe008d901e9c0781f47e8c97f68803253b959d4dceea3fb59524247076 |
| fonts/Lora.ttf | 822a6621ccbe8d97d20ac88c1c41f5615c9c2c202eaa75f272cd452aac6475a7 |
| fonts/Lora-Italic.ttf | 22d8d8854b53807aa664ca34f2031a9ed57a1d0dea296b8b96cdd3aad937a2b3 |
| fonts/Cinzel.ttf | f4d83d34d1f6c741193e4acf4b3dff9531e5a67b6aa65228d00a7db72a4e0f34 |

## stil-canal/ ← „Istorioare cu tâlc – Stil canal” (design system)
https://claude.ai/artifact/WELSeWT4AcWhF3SzB3P9T9 (versiunea 1795103716-1121)

| fișier | sha256 |
|---|---|
| project/README.md | bc5dd7a4039d7732354a1dca2147585eb5b304cb7f6ed0451af8e87cc2ddf04d |
| project/pipeline/voci.json | e551ba7a408155b61c776af304df3fd56a0717be47c8fa7c1c3057da402c33d8 |
| project/tokens.json | aaf8622f28f975a6dd74905750bda037211013345a8e1e7961eea7777158ffe4 |
| project/design-system.json | 950b0321598440e8ff6a65d873d7926045d7a0f128b3420d00d82d44b4819150 |

Vocea EN nu e încă aleasă (`voci.json`: `"aprobat": false`); se alege la primul episod în engleză (faza 4).

## Cum le folosește platforma

Workerul copiază, pentru fiecare episod, `motor/pipeline/*` în `work/ep-NNN/pipeline/` (cu `build_v2.py.txt` redenumit în `build_v2.py`, cum cere skill-ul) și `motor/fonts/*` în `work/ep-NNN/fonts/`. Copiile din `vendor/` rămân neatinse.

## De verificat în faza 3 (Windows)
- `build_v2.py` caută Chrome doar în căi Linux (`/usr/bin/...`). Pe Windows cade pe Chromium-ul Playwright, care trebuie instalat cu `python -m playwright install chromium`.
- Scriptul folosește `multiprocessing.Process`; pe Windows (metoda spawn) trebuie testat că randarea paralelă pornește corect.
