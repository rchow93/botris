import { useEffect, useReducer, useRef, useState } from "react";
import {
  createGame,
  reduce,
  DAS_MS,
  ARR_MS,
  GameState,
} from "./game/engine";
import { ScoreEntry, cleanName, insertScore, qualifies } from "./game/leaderboard";
import Board from "./components/Board";
import Sidebar from "./components/Sidebar";
import GameOver from "./components/GameOver";
import NameGate from "./components/NameGate";
import Music from "./components/Music";

/** Fresh 32-bit PRNG seed per game (the engine itself stays deterministic). */
function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

declare global {
  interface Window {
    /** Electron preload bridge (absent when running in a plain browser). */
    botris?: {
      quit: () => void;
      loadScores: () => Promise<ScoreEntry[]>;
      saveScores: (entries: ScoreEntry[]) => Promise<boolean>;
    };
  }
}

/** Fallback storage key when running in a plain browser (no Electron). */
const LS_KEY = "botris-leaderboard";

/** Where the player's name (entered at game start) is remembered. */
const NAME_KEY = "botris-name";

/** Load the leaderboard: Electron JSON file, or localStorage in a browser. */
async function loadScores(): Promise<ScoreEntry[]> {
  if (window.botris) {
    try {
      return await window.botris.loadScores();
    } catch {
      return [];
    }
  }
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Persist the leaderboard (Electron JSON file, or localStorage). */
async function saveScores(entries: ScoreEntry[]): Promise<void> {
  if (window.botris) {
    await window.botris.saveScores(entries);
    return;
  }
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

export default function App() {
  const [state, dispatch] = useReducer(reduce, freshSeed(), createGame);

  // All-time leaderboard + game-over score prompt.
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [prompting, setPrompting] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  // DAS (delayed auto shift) bookkeeping, driven from the rAF loop.
  const dasRef = useRef<{ dir: 0 | 1 | -1; nextRepeat: number }>({
    dir: 0,
    nextRepeat: 0,
  });
  const leftHeld = useRef(false);
  const rightHeld = useRef(false);

  // Player name (entered at game start) + the start-of-game name gate.
  // The game holds in "paused" while the gate is open.
  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [gateOpen, setGateOpen] = useState(true);
  const gateOpenRef = useRef(gateOpen);
  gateOpenRef.current = gateOpen;

  // Game loop: one TICK per animation frame; the reducer no-ops when paused.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(now - last, 100); // clamp long frame gaps (tab switch)
      last = now;
      dispatch({ type: "tick", dt });
      const dir = dasRef.current.dir;
      if (
        dir !== 0 &&
        now >= dasRef.current.nextRepeat &&
        stateRef.current.status === "playing"
      ) {
        dispatch({ type: "move", dx: dir });
        dasRef.current.nextRepeat = now + ARR_MS;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The loop reads the latest status without re-subscribing.
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;

  // Load the all-time leaderboard once, and start the first game held
  // under the name gate (the engine boots in "playing").
  useEffect(() => {
    loadScores().then(setScores);
    dispatch({ type: "pause" }); // idempotent — StrictMode-safe
  }, []);

  // While the name gate is open, keep the game paused no matter what
  // happens (e.g. an R restart flips a held game back to "playing").
  useEffect(() => {
    if (gateOpen && state.status === "playing") {
      dispatch({ type: "pause" });
    }
  }, [gateOpen, state.status]);

  // When a game ends: a name was entered at start → record the score under
  // it directly (when it makes the top 10); no name → fall back to the
  // initials prompt. When a new game starts (R), reopen the name gate.
  const prevStatus = useRef(state.status);
  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = state.status;
    if (prev === "over" && state.status === "playing") {
      setGateOpen(true);
    } else if (prev !== "over" && state.status === "over") {
      setRank(null);
      if (name.trim() !== "" && qualifies(scoresRef.current, state.score)) {
        saveScore(name); // record it under the player's name
      } else {
        setPrompting(qualifies(scoresRef.current, state.score));
      }
    } else if (state.status !== "over") {
      setPrompting(false);
      setRank(null);
    }
  }, [state.status]);

  /** Submit the start-of-game name gate: remember the name and start. */
  const submitName = (submitted: string) => {
    const clean = cleanName(submitted);
    setName(clean);
    try {
      localStorage.setItem(NAME_KEY, clean);
    } catch {
      /* private mode — the name just won't persist */
    }
    setGateOpen(false);
    dispatch({ type: "togglePause" }); // resume: the gate kept us paused
  };

  /** Record the finished game's score under the given name. */
  const saveScore = (name: string) => {
    const entry: ScoreEntry = {
      name,
      score: stateRef.current.score,
      lines: stateRef.current.lines,
      level: stateRef.current.level,
      date: new Date().toISOString(),
    };
    const { entries, rank: r } = insertScore(scores, entry);
    setScores(entries);
    setRank(r);
    setPrompting(false);
    if (r !== -1) void saveScores(entries);
  };

  useEffect(() => {
    const pressDir = (dir: -1 | 1) => {
      dispatch({ type: "move", dx: dir }); // instant first step
      const now = performance.now();
      dasRef.current = { dir, nextRepeat: now + DAS_MS };
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // DAS repeats are ours, not the OS's
      // While a text field has focus, the field owns the keyboard.
      // The name gate takes *every* key (R/Q type letters); the game-over
      // initials box only cedes R (new game) and Q (quit).
      if (e.target instanceof HTMLInputElement) {
        if (gateOpenRef.current) return;
        if (e.code !== "KeyR" && e.code !== "KeyQ") return;
      }
      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          leftHeld.current = true;
          pressDir(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          rightHeld.current = true;
          pressDir(1);
          break;
        case "ArrowDown":
          e.preventDefault();
          dispatch({ type: "setSoftDrop", on: true });
          break;
        case "ArrowUp":
        case "KeyX":
          e.preventDefault();
          dispatch({ type: "rotate", dir: 1 });
          break;
        case "KeyZ":
          e.preventDefault();
          dispatch({ type: "rotate", dir: -1 });
          break;
        case "Space":
          e.preventDefault();
          dispatch({ type: "hardDrop" });
          break;
        case "KeyP":
          if (gateOpenRef.current) break; // name gate open — no pausing under it
          dispatch({ type: "togglePause" });
          break;
        case "KeyR":
          dispatch({ type: "restart", seed: freshSeed() });
          break;
        case "KeyQ": {
          // Quit the app (Electron bridge); in a plain browser, close the tab.
          if (window.botris) window.botris.quit();
          else window.close();
          break;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        if (e.code === "ArrowLeft") leftHeld.current = false;
        else rightHeld.current = false;
        // If the opposite key is still down, keep auto-shifting in that
        // direction (its DAS was already charging when it was pressed).
        const other = leftHeld.current ? -1 : rightHeld.current ? 1 : 0;
        if (other !== 0 && dasRef.current.dir !== other) {
          dasRef.current = { dir: other, nextRepeat: performance.now() };
        } else if (other === 0) {
          dasRef.current.dir = 0; // stop auto-shifting — nothing is held
        }
      } else if (e.code === "ArrowDown") {
        dispatch({ type: "setSoftDrop", on: false });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="app">
      <h1 className="title">BOTRIS</h1>
      <div className="layout">
        <Board
          board={state.board}
          piece={state.piece}
          status={state.status}
          fallOffset={state.fallOffset}
          gameOver={
            state.status === "over" ? (
              <GameOver
                score={state.score}
                lines={state.lines}
                level={state.level}
                rank={rank}
                prompting={prompting}
                onSaveName={saveScore}
                onSkip={() => setPrompting(false)}
              />
            ) : undefined
          }
          pausedOverlay={
            gateOpen ? (
              <NameGate value={name} onChange={setName} onSubmit={submitName} />
            ) : undefined
          }
        />
        <Music playing={state.status === "playing"} />
        <Sidebar state={state} scores={scores} playerName={name} />
      </div>
    </div>
  );
}
