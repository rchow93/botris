import { useEffect, useRef, useState } from "react";

/** Glob result → asset URLs, sorted by filename for a stable order. */
function sortedUrls(files: Record<string, string>): string[] {
  return Object.keys(files)
    .sort()
    .map((path) => files[path]);
}

// Every audio file in src/assets/music/ is bundled automatically — drop in
// your own tracks (or remove ours) to customise the playlist.
const TRACKS = sortedUrls(
  import.meta.glob<string>(
    "../assets/music/*.{mp3,m4a,ogg,wav,MP3,M4A,OGG,WAV}",
    { eager: true, import: "default" }
  )
);

// Every image in src/assets/pictures/ is bundled automatically — the
// "NOW PLAYING" photo is picked at random from this pool.
const PICTURES = sortedUrls(
  import.meta.glob<string>(
    "../assets/pictures/*.{jpg,jpeg,png,webp,gif,avif,JPG,JPEG,PNG,WEBP}",
    { eager: true, import: "default" }
  )
);

const VOLUME = 0.5;

/** Random permutation of 0..n-1 (Fisher–Yates). */
function shuffled(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Random index in 0..n-1 that is not `except` (0 when n < 2). */
function pickDifferent(except: number, n: number): number {
  if (n < 2) return 0; // one picture (or none): nothing else to pick
  let i = except;
  while (i === except) i = Math.floor(Math.random() * n);
  return i;
}

/**
 * Background music + the "NOW PLAYING" picture.
 *
 * A random starting track is chosen, then the remaining tracks play in a
 * shuffled order (reshuffled after a full cycle), so the starting song and
 * every subsequent one are random with no immediate repeats. A new picture
 * is shown whenever a new song starts — chosen at random from the pool
 * (never the same photo twice in a row). The panel sits
 * in its own column between the board and the sidebar, so it never
 * overlaps the play field or the stats.
 */
export default function Music({ playing }: { playing: boolean }) {
  // Playback order: a random permutation; the first entry is the start song.
  const orderRef = useRef(shuffled(TRACKS.length));
  const stepRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // Current track position and the picture shown for it.
  const [pos, setPos] = useState(() => orderRef.current[0]);
  const [picIdx, setPicIdx] = useState(
    () => Math.floor(Math.random() * PICTURES.length)
  );

  useEffect(() => {
    if (TRACKS.length === 0) return; // empty music folder: stay silent
    const audio = new Audio(TRACKS[pos]);
    audio.preload = "auto";
    audio.volume = VOLUME;
    audioRef.current = audio;

    const onEnded = () => {
      stepRef.current += 1;
      // After a full cycle, reshuffle for a fresh random order.
      if (stepRef.current === TRACKS.length) {
        stepRef.current = 0;
        orderRef.current = shuffled(TRACKS.length);
      }
      const nextPos = orderRef.current[stepRef.current];
      setPos(nextPos);
      setPicIdx((p) => pickDifferent(p, PICTURES.length));
      audio.src = TRACKS[nextPos];
      void audio.play().catch(() => {});
    };
    audio.addEventListener("ended", onEnded);

    // Browsers block autoplay without a user gesture; the first key press or
    // click unlocks it. (Electron has no such restriction.)
    const start = () => {
      if (playingRef.current && audio.paused) void audio.play().catch(() => {});
    };
    window.addEventListener("keydown", start);
    window.addEventListener("pointerdown", start);

    void audio.play().catch(() => {});

    return () => {
      window.removeEventListener("keydown", start);
      window.removeEventListener("pointerdown", start);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && audio.paused) void audio.play().catch(() => {});
    else if (!playing && !audio.paused) audio.pause();
  }, [playing]);

  if (PICTURES.length === 0) return null; // empty pictures folder: no panel

  return (
    <div className="panel now-playing">
      <div className="panel-label">NOW PLAYING</div>
      {/* key={picIdx} remounts the <img> on every song change → CSS crossfade */}
      <img
        key={picIdx}
        className="now-playing-img"
        src={PICTURES[picIdx]}
        alt="Now playing"
      />
    </div>
  );
}
