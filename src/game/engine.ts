// Pure Botris engine — no React. `reduce` is a pure reducer driven by
// actions; the React layer only renders state and maps input/timing onto
// actions. Randomness goes through a seeded PRNG stored in state, so the
// reducer is deterministic (and unit-testable).

import { TETROMINOES, ROTATION, KICKS, Tetromino } from "./pieces";

export const COLS = 10;
export const ROWS = 20;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const DAS_MS = 170;
export const ARR_MS = 45;

/** board[row][col]; row 0 is the top of the playfield. */
export type Board = (Tetromino | null)[][];

export interface PieceState {
  type: Tetromino;
  rot: number; // 0 = spawn, 1 = R, 2 = 2, 3 = L
  x: number; // column of the bounding box's left edge
  y: number; // row of the bounding box's top edge (may be < 0, above the field)
}

export type Status = "playing" | "paused" | "over";

export interface GameState {
  board: Board;
  piece: PieceState | null;
  queue: Tetromino[]; // upcoming pieces; queue[0] = NEXT preview
  seed: number; // PRNG state, kept in state so `reduce` stays pure
  score: number;
  lines: number;
  level: number;
  status: Status;
  softDrop: boolean;
  /**
   * Sub-row fall progress (0..1) while the piece is airborne. The renderer
   * uses it to paint the piece at a fractional row — motion stays smooth
   * even when gravity is faster than one row per frame.
   */
  fallOffset: number;
  lockTimer: number; // ms spent grounded (advances only while grounded)
  lockResets: number; // move/rotate lock-delay resets used on this piece
}

export type Action =
  | { type: "tick"; dt: number }
  | { type: "move"; dx: -1 | 1 }
  | { type: "rotate"; dir: 1 | -1 }
  | { type: "setSoftDrop"; on: boolean }
  | { type: "hardDrop" }
  | { type: "togglePause" }
  | { type: "pause" }
  | { type: "restart"; seed: number };

// ---------------------------------------------------------------------------
// Random pieces (7-bag)
// ---------------------------------------------------------------------------

/** mulberry32: advances the seed and returns [random float in [0,1), newSeed]. */
function nextRand(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, s];
}

/** One shuffled 7-bag. Deterministic in `seed`. */
export function makeBag(seed: number): { bag: Tetromino[]; seed: number } {
  const bag = [...TETROMINOES];
  let s = seed;
  for (let i = bag.length - 1; i > 0; i--) {
    const [r, s2] = nextRand(s);
    s = s2;
    const j = Math.floor(r * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return { bag, seed: s };
}

function topUp(
  queue: Tetromino[],
  seed: number,
  min: number
): { queue: Tetromino[]; seed: number } {
  const q = [...queue];
  let s = seed;
  while (q.length < min) {
    const { bag, seed: s2 } = makeBag(s);
    s = s2;
    q.push(...bag);
  }
  return { queue: q, seed: s };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () =>
    Array<Tetromino | null>(COLS).fill(null)
  );
}

/** Board cells occupied by the piece, as [x, y] pairs (y may be negative). */
export function pieceCells(piece: PieceState): [number, number][] {
  return ROTATION[piece.type][piece.rot].map(([cx, cy]) => [
    piece.x + cx,
    piece.y + cy,
  ]);
}

/** Does `piece` (optionally shifted by dx/dy) hit a wall, the floor, or a block? */
export function collides(
  board: Board,
  piece: PieceState,
  dx = 0,
  dy = 0
): boolean {
  for (const [cx, cy] of ROTATION[piece.type][piece.rot]) {
    const bx = piece.x + cx + dx;
    const by = piece.y + cy + dy;
    if (bx < 0 || bx >= COLS || by >= ROWS) return true;
    if (by >= 0 && board[by][bx] !== null) return true;
  }
  return false;
}

export function isGrounded(board: Board, piece: PieceState): boolean {
  return collides(board, piece, 0, 1);
}

/** All pieces spawn centered (box left edge on column 3) at the top row. */
function spawnPiece(type: Tetromino): PieceState {
  return { type, rot: 0, x: 3, y: 0 };
}

/** Guideline gravity: ~1000 ms at level 1, accelerating each level. */
export function gravityIntervalMs(level: number): number {
  return 1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}

/** 25 rows per second — the soft-drop speed cap (see softDropIntervalMs). */
export const SOFT_DROP_MS = 40;

/**
 * Soft drop: 20× gravity, capped at SOFT_DROP_MS per row. Without the cap a
 * high-level piece would fall 20+ rows per frame — a blur you can't stop on
 * a target. With it, the fall is always stoppable a row or two early.
 */
export function softDropIntervalMs(level: number): number {
  return Math.max(gravityIntervalMs(level) / 20, SOFT_DROP_MS);
}

// ---------------------------------------------------------------------------
// Locking, line clears, scoring
// ---------------------------------------------------------------------------

const LINE_SCORES = [0, 100, 300, 500, 800];

function clearLines(board: Board): { board: Board; cleared: number } {
  const remaining = board.filter((row) => row.some((c) => c === null));
  const cleared = ROWS - remaining.length;
  if (cleared === 0) return { board, cleared: 0 };
  const fresh = Array.from({ length: cleared }, () =>
    Array<Tetromino | null>(COLS).fill(null)
  );
  return { board: [...fresh, ...remaining], cleared };
}

/** Merge the current piece into the board, clear lines, spawn the next. */
function lockPiece(state: GameState): GameState {
  const piece = state.piece as PieceState;
  const board = state.board.map((row) => [...row]);
  let toppedOut = false;
  for (const [bx, by] of pieceCells(piece)) {
    if (by < 0) {
      toppedOut = true;
      continue;
    }
    board[by][bx] = piece.type;
  }
  if (toppedOut) {
    return { ...state, board, piece: null, status: "over" };
  }

  const { board: settled, cleared } = clearLines(board);
  const lines = state.lines + cleared;
  const level = Math.floor(lines / 10) + 1;
  const score = state.score + LINE_SCORES[cleared] * state.level;

  // Next piece comes from the head of the queue.
  const nextType = state.queue[0];
  const { queue, seed } = topUp(state.queue.slice(1), state.seed, 1);
  const fresh = spawnPiece(nextType);
  if (collides(settled, fresh)) {
    return {
      ...state,
      board: settled,
      piece: null,
      queue,
      seed,
      score,
      lines,
      level,
      status: "over",
    };
  }
  return {
    ...state,
    board: settled,
    piece: fresh,
    queue,
    seed,
    score,
    lines,
    level,
    fallOffset: 0,
    lockTimer: 0,
    lockResets: 0,
  };
}

/** After a successful move/rotate: refresh gravity + lock-delay timers. */
function settleTimers(state: GameState): GameState {
  const grounded = isGrounded(state.board, state.piece as PieceState);
  if (!grounded) {
    // Still airborne: keep the sub-row fall offset so horizontal moves
    // don't visibly pop the piece up mid-fall.
    return { ...state, lockTimer: 0 };
  }
  if (state.lockResets < MAX_LOCK_RESETS) {
    return { ...state, fallOffset: 0, lockTimer: 0, lockResets: state.lockResets + 1 };
  }
  // Reset budget exhausted — piece locks on the current timer.
  return { ...state, fallOffset: 0 };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function createGame(seed: number): GameState {
  const filled = topUp([], seed, 1);
  const piece = spawnPiece(filled.queue[0]);
  return {
    board: emptyBoard(),
    piece,
    queue: filled.queue.slice(1),
    seed: filled.seed,
    score: 0,
    lines: 0,
    level: 1,
    status: "playing",
    softDrop: false,
    fallOffset: 0,
    lockTimer: 0,
    lockResets: 0,
  };
}

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "restart":
      return createGame(action.seed);

    case "togglePause":
      if (state.status === "playing") return { ...state, status: "paused" };
      if (state.status === "paused") return { ...state, status: "playing" };
      return state;

    case "pause":
      // Idempotent — safe to dispatch from effects that may run twice
      // (React StrictMode double-invokes mount effects in dev).
      if (state.status === "playing") return { ...state, status: "paused" };
      return state;
  }

  if (state.status !== "playing" || !state.piece) return state;

  switch (action.type) {
    case "setSoftDrop":
      return state.softDrop === action.on
        ? state
        : { ...state, softDrop: action.on };

    case "move": {
      const piece = state.piece;
      if (collides(state.board, piece, action.dx, 0)) return state;
      return settleTimers({
        ...state,
        piece: { ...piece, x: piece.x + action.dx },
      });
    }

    case "rotate": {
      const piece = state.piece;
      const to = (piece.rot + (action.dir === 1 ? 1 : 3)) % 4;
      const kicks =
        piece.type === "I" ? KICKS.i[piece.rot][to] : KICKS.normal[piece.rot][to];
      for (const [dx, dy] of kicks) {
        // Test the rotated shape, not the old one.
        if (collides(state.board, { ...piece, rot: to }, dx, dy)) continue;
        return settleTimers({
          ...state,
          piece: { ...piece, rot: to, x: piece.x + dx, y: piece.y + dy },
        });
      }
      return state; // every kick failed
    }

    case "hardDrop": {
      const piece = state.piece;
      let dy = 0;
      while (!collides(state.board, piece, 0, dy + 1)) dy++;
      const dropped = {
        ...state,
        piece: { ...piece, y: piece.y + dy },
        score: state.score + dy * 2,
      };
      return lockPiece(dropped);
    }

    case "tick": {
      const piece = state.piece;
      if (!isGrounded(state.board, piece)) {
        // Falling: advance a sub-row fall offset. The piece's y commits a
        // full row at a time, but the remainder stays fractional so the
        // renderer paints smooth motion at any speed (no 2–3 row jumps).
        const interval = state.softDrop
          ? softDropIntervalMs(state.level)
          : gravityIntervalMs(state.level);
        let offset = state.fallOffset + action.dt / interval;
        let y = piece.y;
        let score = state.score;
        while (offset >= 1) {
          // Can the piece actually occupy the next row? (isGrounded(y+1)
          // would look one row further down — landing one row too early,
          // hovering, and re-snapping every frame.)
          if (collides(state.board, { ...piece, y: y + 1 })) {
            offset = 0; // landed — y is the rest row
            break;
          }
          y += 1;
          offset -= 1;
          if (state.softDrop) score += 1; // 1 pt per soft-dropped row
        }
        if (y === piece.y && offset === state.fallOffset) return state;
        return { ...state, piece: { ...piece, y }, score, fallOffset: offset };
      }
      // Grounded: run the lock delay.
      const lockTimer = state.lockTimer + action.dt;
      if (lockTimer >= LOCK_DELAY_MS) {
        return lockPiece(state);
      }
      return { ...state, fallOffset: 0, lockTimer };
    }

    default:
      return state;
  }
}
