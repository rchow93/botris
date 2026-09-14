import {
  Board as BoardGrid,
  COLS,
  ROWS,
  PieceState,
  Status,
  pieceCells,
} from "../game/engine";
import { COLORS, Tetromino } from "../game/pieces";
import { ReactNode } from "react";

interface Props {
  board: BoardGrid;
  piece: PieceState | null;
  status: Status;
  /**
   * Fractional rows (0..1) the piece has fallen past its current grid row.
   * The piece layer is offset by this many rows so gravity renders smoothly
   * (sub-row) at every level.
   */
  fallOffset?: number;
  /** Replaces the default game-over overlay (used for the score prompt). */
  gameOver?: ReactNode;
  /** Replaces the default pause overlay (used for the name prompt). */
  pausedOverlay?: ReactNode;
}

/** 28px cell + 1px grid gap = the distance between a cell's top-left origins. */
const PITCH = 29;

/**
 * 10×20 grid of locked cells, with the active piece painted on an
 * absolutely-positioned layer that is shifted down by `fallOffset` rows.
 * Both render in the guideline colour of their piece type.
 */
export default function Board({ board, piece, status, fallOffset = 0, gameOver, pausedOverlay }: Props) {
  const cells: (Tetromino | null)[] = new Array(ROWS * COLS);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) cells[y * COLS + x] = board[y][x];
  }

  return (
    <div className="board-frame">
      <div className="board-grid">
        {cells.map((t, i) => (
          <div
            key={i}
            className={"cell" + (t ? " filled" : "")}
            style={
              t
                ? { background: COLORS[t], boxShadow: `inset 0 0 6px ${COLORS[t]}55` }
                : undefined
            }
          />
        ))}
      </div>
      {piece && (
        <div
          className="piece-layer"
          style={{ transform: `translateY(${fallOffset * PITCH}px)` }}
        >
          {pieceCells(piece)
            .filter(([, y]) => y >= 0 && y < ROWS)
            .map(([x, y], i) => (
              <div
                key={i}
                className="cell filled"
                style={{
                  left: x * PITCH,
                  top: y * PITCH,
                  background: COLORS[piece.type],
                  boxShadow: `inset 0 0 6px ${COLORS[piece.type]}55`,
                }}
              />
            ))}
        </div>
      )}
      {status === "paused" &&
        (pausedOverlay ?? (
          <div className="overlay">
            <h2>Paused</h2>
            <p>Press P to resume</p>
          </div>
        ))}
      {status === "over" &&
        (gameOver ?? (
          <div className="overlay">
            <h2>Game Over</h2>
            <p>Press R for a new game</p>
          </div>
        ))}
    </div>
  );
}
