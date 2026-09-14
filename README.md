# Botris

A Tetris-inspired falling-block puzzle game built with **Electron + React +
TypeScript** — SRS rotation, 7-bag randomizer, lock delay, and an all-time
leaderboard.

## Requirements

- Node.js 18+
- npm

## Setup

```sh
npm install
```

## Run

```sh
npm run dev
```

Starts the Vite dev server and opens the Electron window (with hot reload on code changes).

Other scripts:

```sh
npm test       # run the engine test suite (vitest)
npm run build  # production build of the web bundle into dist/
npm start      # run Electron against the production build
```

## Controls

| Key             | Action                        |
| --------------- | ----------------------------- |
| ← / →           | Move (DAS auto-repeat)        |
| ↓               | Soft drop                     |
| ↑ or X          | Rotate clockwise              |
| Z               | Rotate counter-clockwise      |
| Space           | Hard drop                     |
| P               | Pause / resume                |
| R               | Restart with a new seed       |
| Q               | Quit the app                  |

## Leaderboard

The all-time **top 10** scores are kept. When a game starts you're asked for
your **name** (letters, up to 12 characters; Enter to start, leave blank to
play anonymously). The name is shown in the sidebar during the game and is
recorded automatically on the leaderboard when a game ends with a score that
makes the board. If no name was entered, you're prompted for up to 3
initials instead (Enter to save, Esc to skip). The top 10 is always visible
in the sidebar.

Scores persist to a flat JSON file in the app's userData directory
(`~/Library/Application Support/botris/leaderboard.json` on macOS,
`%APPDATA%/botris/leaderboard.json` on Windows). Running in a plain browser
instead of Electron falls back to `localStorage`.

## Custom music & pictures

Botris ships with royalty-free background music and dog photos (see
[Credits](#credits)). You can use your own — no code changes needed, just
put files in these folders:

| Content                  | Folder                | Formats                                     |
| ------------------------ | --------------------- | ------------------------------------------- |
| Background music         | `src/assets/music/`    | `.mp3`, `.m4a`, `.ogg`, `.wav`              |
| "NOW PLAYING" pictures   | `src/assets/pictures/` | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif` |

- **Every file in these folders is picked up automatically.** Add yours
  alongside the defaults, or delete the defaults to play only your own.
- **Music** plays in a random shuffle, reshuffled after every full cycle.
- **Pictures** change to a random one each time a new song starts. The
  panel is a 3:4 portrait frame (180 px wide), and images are cropped to
  fill it — portrait photos around 600×800 px look best.
- Either folder can be empty: no music plays, or the picture panel is hidden.
- Files are bundled at build time, so restart `npm run dev` (or re-run
  `npm run build`) after adding or removing files.
- If you publish a fork with different media, make sure you have the rights
  to it and update the Credits section.

## How it works

- `src/game/engine.ts` — the entire game as a pure `reduce(state, action)`
  function: SRS rotation with wall kicks, 7-bag randomizer, guideline gravity
  curve, smooth (sub-row) falling, lock delay (500 ms) with move-reset, line
  clears, and scoring.

  **Speed:** the fall interval follows the guideline gravity curve —
  `1000 · (0.8 − (level−1)·0.007)^(level−1)` ms per row, where level is
  ⌊lines/10⌋ + 1. So the pieces fall faster as you clear lines: ~1000 ms at
  level 1, ~355 ms at level 5, ~64 ms at level 10, ~7 ms at level 15.

  **Smooth falling:** gravity is tracked as a fractional `fallOffset`
  (0..1 rows) in the engine, and the renderer paints the active piece with
  that many rows of pixel offset each frame. The piece therefore moves
  continuously at every level — at high levels where the gravity interval is
  shorter than a frame, it interpolates between rows instead of visibly
  jumping 2–3 cells.

  **Soft drop control:** soft drop is 20× the normal gravity rate but capped
  at 40 ms per row (25 rows/sec), so even at high levels you can drop the
  piece quickly and still stop it a row or two early. 1 point per soft-dropped
  row.
- `src/components/Music.tsx` — background music + "NOW PLAYING" picture:
  a random starting track is chosen, then the remaining tracks play in a
  random (shuffled) order, re-shuffling after every full cycle. A picture
  from `src/assets/pictures/` (one per track) is shown in a narrow panel
  between the board and the sidebar and crossfades to a new one whenever
  the song changes. Music pauses with the game (P) and resumes on
  unpause.
- `src/game/pieces.ts` — tetromino shapes, rotation tables, SRS kick data.
- `src/game/engine.test.ts` — unit tests for the engine (18 tests, `npm test`).
- `src/App.tsx` — React shell: a `requestAnimationFrame` loop dispatching
  `tick` actions, plus DAS (170 ms delay, 45 ms auto-repeat rate) for held
  movement keys.
- `electron/main.js` — minimal Electron window wrapper.

Because the engine is a pure function with no DOM or timers, it is fully
testable and could be reused in a web-only or headless build.

## Credits

All music and photos are from [Pixabay](https://pixabay.com) and are used
under the [Pixabay Content License](https://pixabay.com/service/license-summary/).
They are included only as part of the game and remain the property of their
creators — check Pixabay's license before reusing them elsewhere. Creators are
listed by Pixabay username, with Pixabay item IDs in parentheses.

**Music:** atlasaudio (519455) · echoes_of_lumen (584907) · leberch (522790,
580519, 580523, 580526, 580537) · monume (576956) · sub_clair (579505, 579510,
579511, 579513) · the_mountain (443538, 508025, 513154, 522470)

**Photos:** 3194556 (1903313) · alainaudet (562723) · aleshava (5357794) ·
alexas_fotos (6961236) · alkhaine (5937757) · briam (5519360) · hoan72
(9670619) · jatocreate (7392840) · lucioliu (4988985, 4988986) · lum3n
(838281) · melissa197 (8781844) · nana_amigo_canino (6977210) · pezibear
(1123016, 4783327) · rzierik (5671778) · shuttrjake (7770069) · skica911
(6563435) · vlaaitje (1047518, 1047521)

## License

Code is [MIT](LICENSE). The music and photos in `src/assets/` are **not**
covered by the MIT license — see Credits above.

## Trademark

Tetris® is a registered trademark of The Tetris Company. Botris is an
independent fan project and is not affiliated with or endorsed by The Tetris
Company.
