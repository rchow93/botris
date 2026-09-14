import { GameState } from "../game/engine";
import { COLORS, ROTATION, Tetromino } from "../game/pieces";
import { ScoreEntry } from "../game/leaderboard";

const PREV_SIZE = 4;

/**
 * Cells of a piece's spawn state, normalised into a 4×4 preview grid
 * (centre-aligned so 3×3-box pieces sit in the middle of the NEXT box).
 */
function previewCells(type: Tetromino): [number, number][] {
  const cells = ROTATION[type][0];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const ox = Math.floor((PREV_SIZE - (maxX - minX + 1)) / 2);
  const oy = Math.floor((PREV_SIZE - (maxY - minY + 1)) / 2);
  return cells.map(([x, y]) => [x - minX + ox, y - minY + oy] as [number, number]);
}

export default function Sidebar({
  state,
  scores,
  playerName,
}: {
  state: GameState;
  scores: ScoreEntry[];
  /** The player's name (entered at game start); empty = anonymous. */
  playerName: string;
}) {
  const next = state.queue[0];
  const preview: (Tetromino | null)[] = new Array(PREV_SIZE * PREV_SIZE).fill(
    null
  );
  if (next) {
    for (const [x, y] of previewCells(next)) {
      preview[y * PREV_SIZE + x] = next;
    }
  }

  return (
    <div className="sidebar">
      <div className="panel next-panel">
        <div className="panel-label">NEXT</div>
        <div className="next-grid">
          {preview.map((t, i) => (
            <div
              key={i}
              className={"cell" + (t ? " filled" : "")}
              style={
                t
                  ? {
                      background: COLORS[t],
                      boxShadow: `inset 0 0 5px ${COLORS[t]}55`,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>

      <div className="stat">
        <span className="stat-label">Player</span>
        <span className="stat-value">{playerName || "—"}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Score</span>
        <span className="stat-value">{state.score}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Lines</span>
        <span className="stat-value">{state.lines}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Level</span>
        <span className="stat-value">{state.level}</span>
      </div>

      <div className="panel">
        <div className="panel-label">TOP 10</div>
        {scores.length === 0 ? (
          <p className="lb-empty">No scores yet</p>
        ) : (
          scores.map((s, i) => (
            <div className="lb-row" key={i}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-name">{s.name}</span>
              <span className="lb-score">{s.score}</span>
            </div>
          ))
        )}
      </div>

      <div className="legend">
        <p>←/→ move&nbsp;&nbsp;↑ or X rotate</p>
        <p>Z rotate CCW&nbsp;&nbsp;↓ soft drop</p>
        <p>Space hard drop&nbsp;&nbsp;P pause</p>
        <p>R new game&nbsp;&nbsp;Q quit</p>
      </div>
    </div>
  );
}
