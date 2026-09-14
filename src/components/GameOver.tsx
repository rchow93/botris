import { useEffect, useRef, useState } from "react";
import { cleanName } from "../game/leaderboard";

interface Props {
  score: number;
  lines: number;
  level: number;
  /** 0-based rank once saved; null = nothing saved yet this game. */
  rank: number | null;
  /** True while the initials prompt is showing. */
  prompting: boolean;
  onSaveName: (name: string) => void;
  onSkip: () => void;
}

/**
 * Game-over overlay. When the score made the top 10, prompts for initials;
 * Enter saves, Escape skips, R (handled globally) starts a new game.
 */
export default function GameOver({
  score,
  lines,
  level,
  rank,
  prompting,
  onSaveName,
  onSkip,
}: Props) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prompting) inputRef.current?.focus();
  }, [prompting]);

  return (
    <div className="overlay">
      <h2>Game Over</h2>
      <p className="final-stats">
        {score} pts · {lines} lines · level {level}
      </p>
      {prompting && (
        <>
          <p>New top-10 score — enter your initials</p>
          <input
            ref={inputRef}
            className="initials"
            value={name}
            maxLength={3}
            autoFocus
            onChange={(e) => setName(cleanName(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.length > 0) onSaveName(name);
              if (e.key === "Escape") onSkip();
            }}
          />
          <p>Enter to save · Esc to skip</p>
        </>
      )}
      {rank !== null && (
        <p className="rank">
          Saved at #{rank + 1} on the leaderboard
        </p>
      )}
      {!prompting && rank === null && <p>Press R for a new game</p>}
    </div>
  );
}
