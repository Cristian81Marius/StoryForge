import { spawn } from "node:child_process";

/**
 * Muzică de fundal OPȚIONALĂ (Setări → Template video → Muzică). Skill-ul recomandă muzica din
 * bibliotecile platformelor (fără probleme de Content ID); aceasta e pentru un fișier propriu, cu drepturi.
 * Muzica se repetă pe toată durata, coboară automat când vorbește vocea (sidechain), apoi totul
 * e readus la -14 LUFS / vârf ≤ -1.5 dBTP, ca în skill.
 */
export function musicFilter(volumeDb: number, durationSec: number): string {
  const v = Math.max(-40, Math.min(-6, volumeDb));
  const fadeOut = Math.max(0, durationSec - 2);
  return (
    `[0:a]asplit=2[voice][key];` +
    `[1:a]volume=${v}dB,afade=t=in:d=1.5,afade=t=out:st=${fadeOut.toFixed(2)}:d=2[m];` +
    `[m][key]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=500[duck];` +
    `[voice][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`
  );
}

export function addBackgroundMusic(input: string, music: string, dest: string, volumeDb: number, durationSec: number): Promise<void> {
  return new Promise((res, rej) => {
    const c = spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", input, "-stream_loop", "-1", "-i", music, "-filter_complex", musicFilter(volumeDb, durationSec),
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-t", durationSec.toFixed(3), "-movflags", "+faststart", dest],
      { windowsHide: true },
    );
    let err = "";
    c.stderr.on("data", (d) => (err += d));
    c.on("error", rej);
    c.on("close", (code) => (code === 0 ? res() : rej(new Error(`mixajul muzicii a eșuat: ${err.slice(-500)}`))));
  });
}
