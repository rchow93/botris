import { describe, expect, it } from "vitest";
import {
  COLS,
  ROWS,
  LOCK_DELAY_MS,
  createGame,
  reduce,
  makeBag,
  isGrounded,
  gravityIntervalMs,
  pieceCells,
} from "./engine";
import type { GameState, PieceState } from "./engine";
import { TETROMINOES } from "./pieces";

const SEED = 20260817;

/** Fresh game with the piece replaced (default: T at spawn). */
function withPiece(state: GameState, piece: Partial<PieceState>): GameState {
  return { ...state, piece: { type: "T", rot: 0, x: 3, y: 0, ...piece } };
}

/** Board-space cells of a piece, as sorted "x,y" strings. */
function cellsOf(piece: PieceState): string[] {
  return pieceCells(piece)
    .map(([x, y]) => `${x},${y}`)
    .sort();
}

/**
 * Fills the bottom row (one hole under column 5) and drops a vertical I
 * into it, clearing exactly one line.
 */
function clearBottomRow(s: GameState): GameState {
  const board = s.board.map((row) => [...row]);
  for (let x = 0; x < COLS; x++) board[ROWS - 1][x] = "J";
  board[ROWS - 1][5] = null;
  return reduce(
    withPiece({ ...s, board }, { type: "I", rot: 1, x: 3, y: 0 }),
    { type: "hardDrop" }
  );
}

describe("makeBag (7-bag randomizer)", () => {
  it("shuffles all seven tetrominoes exactly once", () => {
    for (const seed of [1, 42, SEED]) {
      const { bag } = makeBag(seed);
      expect([...bag].sort()).toEqual([...TETROMINOES].sort());
    }
  });

  it("is deterministic for a given seed", () => {
    expect(makeBag(SEED).bag).toEqual(makeBag(SEED).bag);
  });

  it("the first seven pieces served are all distinct", () => {
    const s = createGame(SEED);
    const served = [s.piece!.type, ...s.queue.slice(0, 6)];
    expect(new Set(served).size).toBe(7);
  });
});

describe("rotation (SRS)", () => {
  it("rotates the T piece clockwise with the R-state cells", () => {
    const after = reduce(withPiece(createGame(SEED), {}), {
      type: "rotate",
      dir: 1,
    });
    expect(after.piece!.rot).toBe(1);
    expect(cellsOf(after.piece!)).toEqual(["4,0", "4,1", "4,2", "5,1"]);
  });

  it("rotates the T piece counter-clockwise with the L-state cells", () => {
    const after = reduce(withPiece(createGame(SEED), {}), {
      type: "rotate",
      dir: -1,
    });
    expect(after.piece!.rot).toBe(3);
    expect(cellsOf(after.piece!)).toEqual(["3,1", "4,0", "4,1", "4,2"]);
  });

  it("fails the rotation when every kick collides", () => {
    // Vertical I in the left-wall floor corner, rotated CCW into 0-state
    // (row 1 of the 4×4 box). Kicks tried: (0,0) and (-1,0) run into the
    // left wall, (2,0) and (2,-1) hit the J blocks, (-1,2) runs into the
    // wall again — so the action is a no-op.
    const board = createGame(SEED).board.map((row) => [...row]);
    board[16][1] = "J";
    board[17][1] = "J";
    const s = withPiece({ ...createGame(SEED), board }, {
      type: "I",
      rot: 1,
      x: -2,
      y: 16,
    });
    expect(reduce(s, { type: "rotate", dir: -1 })).toBe(s);
  });
});

describe("SRS wall kicks", () => {
  it("kicks the I piece out of the left-wall floor corner", () => {
    // Vertical I flush against the left wall, resting on the floor.
    // 1→0 kicks are [(0,0), (2,0), …]: (0,0) is out of bounds, (2,0) fits.
    const s = withPiece(createGame(SEED), { type: "I", rot: 1, x: -2, y: 16 });
    const after = reduce(s, { type: "rotate", dir: -1 });
    expect(after.piece!.rot).toBe(0);
    expect(after.piece!.x).toBe(0);
    expect(after.piece!.y).toBe(16);
  });
});

describe("line clears and scoring", () => {
  it("clears a line: +100 × level, board row collapses", () => {
    const after = clearBottomRow(createGame(SEED));
    expect(after.lines).toBe(1);
    // 16 rows of hard drop (2 pts/row) + one single (100 × level 1).
    expect(after.score).toBe(16 * 2 + 100);
    // The filled row is gone; the I piece's three surviving cells (the
    // fourth was in the cleared row) now sit in the bottom three rows.
    expect(after.board[ROWS - 1].filter((c) => c !== null)).toEqual(["I"]);
    expect(after.board[ROWS - 2][5]).toBe("I");
    expect(after.board[ROWS - 3][5]).toBe("I");
    expect(after.board[ROWS - 4][5]).toBeNull();
    expect(after.status).toBe("playing");
  });

  it("levels up when the line count crosses a multiple of 10", () => {
    const after = clearBottomRow({ ...createGame(SEED), lines: 9 });
    expect(after.lines).toBe(10);
    expect(after.level).toBe(2);
  });
});

describe("locking", () => {
  it("a grounded piece locks after the 500 ms lock delay", () => {
    // Vertical I resting on the floor.
    const s = withPiece(createGame(SEED), { type: "I", rot: 1, x: 3, y: 16 });
    expect(isGrounded(s.board, s.piece!)).toBe(true);

    const t1 = reduce(s, { type: "tick", dt: 499 });
    expect(t1.piece).not.toBeNull(); // not yet
    expect(t1.lockTimer).toBe(499);

    const t2 = reduce(t1, { type: "tick", dt: 1 });
    // Locked into the board and the next piece has spawned.
    expect(t2.board[ROWS - 1][5]).toBe("I");
    expect(t2.piece!.type).toBe(s.queue[0]);
  });

  it("a move while grounded consumes one lock reset", () => {
    const s = withPiece(createGame(SEED), { type: "I", rot: 1, x: 3, y: 16 });
    const after = reduce(s, { type: "move", dx: 1 });
    expect(after.lockResets).toBe(1);
    expect(after.lockTimer).toBe(0);
  });
});

describe("gravity and drops", () => {
  it("gravity steps the piece down every interval", () => {
    const after = reduce(createGame(SEED), {
      type: "tick",
      dt: gravityIntervalMs(1), // 1000 ms at level 1
    });
    expect(after.piece!.y).toBe(1);
  });

  it("lands exactly on its rest row and then locks via gravity", () => {
    // Vertical I on an empty field: bottom cell on row 18 (y=15); its true
    // rest is y=16 (bottom cell on row 19). The old landing check stopped
    // one row early — the piece hovered at y=15 and never locked.
    const s = withPiece(createGame(SEED), { type: "I", rot: 1, x: 3, y: 15 });
    expect(isGrounded(s.board, s.piece!)).toBe(false);

    const fell = reduce(s, { type: "tick", dt: gravityIntervalMs(1) });
    expect(fell.piece!.y).toBe(16); // exactly the rest row, not one above
    expect(fell.fallOffset).toBe(0);

    const locked = reduce(fell, { type: "tick", dt: LOCK_DELAY_MS });
    expect(locked.board[ROWS - 1][5]).toBe("I"); // locked by gravity, not a hard drop
  });

  it("soft drop is 20× faster and scores 1 pt per row", () => {
    const s = { ...createGame(SEED), softDrop: true };
    const after = reduce(s, {
      type: "tick",
      dt: gravityIntervalMs(1) / 20, // 50 ms
    });
    expect(after.piece!.y).toBe(1);
    expect(after.score).toBe(1);
  });
});

  it("falls faster at higher levels (guideline gravity curve)", () => {
    // Level 1 ≈ 1000 ms/row; each level up shrinks the interval, the way
    // the original game speeds up as you progress.
    expect(gravityIntervalMs(1)).toBe(1000);
    for (let level = 2; level <= 20; level++) {
      expect(gravityIntervalMs(level)).toBeLessThan(gravityIntervalMs(level - 1));
    }
    expect(gravityIntervalMs(10)).toBeLessThan(100); // ~64 ms/row after 90 lines
  });

describe("game states", () => {
  it("pauses, ignores ticks while paused, and resumes", () => {
    const s = createGame(SEED);
    const paused = reduce(s, { type: "togglePause" });
    expect(paused.status).toBe("paused");
    expect(reduce(paused, { type: "tick", dt: 5000 })).toBe(paused);
    expect(reduce(paused, { type: "move", dx: 1 })).toBe(paused);
    expect(reduce(paused, { type: "togglePause" }).status).toBe("playing");
  });

  it("game over when the spawned piece collides", () => {
    // Wall off the whole spawn zone (rows 0–2) and lock a piece below it.
    const board = createGame(SEED).board.map((row) => [...row]);
    for (let y = 0; y < 3; y++) {
      // Gap at column 9 so no row is full — full rows would clear and empty
      // the spawn zone again (all pieces spawn within columns 3–6).
      for (let x = 0; x < COLS; x++) if (x !== 9) board[y][x] = "J";
    }
    const s = withPiece({ ...createGame(SEED), board }, {
      type: "I",
      rot: 1,
      x: 3,
      y: 16,
    });
    expect(reduce(s, { type: "hardDrop" }).status).toBe("over");
  });

  it("restart creates a fresh game from the given seed", () => {
    const s = createGame(SEED);
    const after = reduce(s, { type: "restart", seed: SEED });
    expect(after).toEqual(createGame(SEED));
  });
});
