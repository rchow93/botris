import { useEffect, useRef, useState } from "react";
import { cleanName } from "../game/leaderboard";

interface Props {
  /** The name entered so far (kept in App so it survives a restart). */
  value: string;
  onChange: (value: string) => void;
  /** Submit the (possibly empty) name and start the game. */
  onSubmit: (name: string) => void;
}

/**
 * Start-of-game overlay: "enter your name". The name identifies the player
 * during the game and is recorded on the leaderboard when the game ends.
 * Enter starts the game; leaving the field blank plays anonymously.
 */
export default function NameGate({ value, onChange, onSubmit }: Props) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="overlay">
      <h2>Player Name</h2>
      <p>Your name will be shown during the game and saved on the leaderboard</p>
      <input
        ref={inputRef}
        className="name"
        value={draft}
        maxLength={12}
        autoFocus
        placeholder="ANONYMOUS"
        onChange={(e) => {
          const cleaned = cleanName(e.target.value);
          setDraft(cleaned);
          onChange(cleaned);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(cleanName(draft));
        }}
      />
      <p>Enter to start · play on with no name if you leave it blank</p>
    </div>
  );
}
