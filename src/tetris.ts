export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const HIDDEN_ROWS = 2;
export const TOTAL_HEIGHT = BOARD_HEIGHT + HIDDEN_ROWS;
export const CHEESE_ROWS = 10;

export type PieceKind = "I" | "J" | "L" | "O" | "S" | "T" | "Z";
export type Rotation = 0 | 1 | 2 | 3;
export type Cell = PieceKind | "cheese" | null;
export type GameStatus = "playing" | "cleared" | "game-over";

export interface ActivePiece {
  kind: PieceKind;
  x: number;
  y: number;
  rotation: Rotation;
}

export interface Sinner {
  x: number;
  y: number;
  direction: -1 | 1;
  walkAccumulatorMs: number;
  fallAccumulatorMs: number;
  blinkCooldownMs: number;
}

export interface RandomSource {
  next(): number;
}

export interface GameState {
  board: Cell[][];
  active: ActivePiece;
  sinner: Sinner;
  hold: PieceKind | null;
  canHold: boolean;
  queue: PieceKind[];
  bag: PieceKind[];
  status: GameStatus;
  startedAt: number;
  elapsedMs: number;
  lockDelayMs: number;
  gravityMs: number;
  fallAccumulatorMs: number;
  lockAccumulatorMs: number;
  rng: RandomSource;
}

const PIECES: PieceKind[] = ["I", "J", "L", "O", "S", "T", "Z"];

const SPAWN_X: Record<PieceKind, number> = {
  I: 3,
  J: 3,
  L: 3,
  O: 4,
  S: 3,
  T: 3,
  Z: 3,
};

const SHAPES: Record<PieceKind, Array<ReadonlyArray<readonly [number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
};

const JLSTZ_KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

const I_KICKS: Record<string, ReadonlyArray<readonly [number, number]>> = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export function createGame(seed = Date.now()): GameState {
  const rng = seededRng(seed);
  const board = createCheeseBoard(rng);
  const state: GameState = {
    board,
    active: { kind: "T", x: 3, y: 0, rotation: 0 },
    sinner: spawnSinner(),
    hold: null,
    canHold: true,
    queue: [],
    bag: [],
    status: "playing",
    startedAt: 0,
    elapsedMs: 0,
    lockDelayMs: 500,
    gravityMs: 900,
    fallAccumulatorMs: 0,
    lockAccumulatorMs: 0,
    rng,
  };
  fillQueue(state);
  state.active = spawnPiece(drawNext(state));
  if (!canPlace(state.board, state.active)) {
    state.status = "game-over";
  }
  return state;
}

export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: TOTAL_HEIGHT }, () => Array<Cell>(BOARD_WIDTH).fill(null));
}

export function createCheeseBoard(rng: RandomSource): Cell[][] {
  const board = createEmptyBoard();
  for (let y = TOTAL_HEIGHT - CHEESE_ROWS; y < TOTAL_HEIGHT; y += 1) {
    const gap = Math.floor(rng.next() * BOARD_WIDTH);
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      board[y]![x] = x === gap ? null : "cheese";
    }
  }
  return board;
}

export function spawnSinner(): Sinner {
  return {
    x: Math.floor(BOARD_WIDTH / 2),
    y: HIDDEN_ROWS,
    direction: 1,
    walkAccumulatorMs: 0,
    fallAccumulatorMs: 0,
    blinkCooldownMs: 0,
  };
}

export function getBlocks(piece: ActivePiece): Array<readonly [number, number]> {
  return SHAPES[piece.kind][piece.rotation]!.map(([dx, dy]) => [piece.x + dx, piece.y + dy] as const);
}

export function getPreviewBlocks(kind: PieceKind): Array<readonly [number, number]> {
  return SHAPES[kind][0]!.map(([x, y]) => [x, y] as const);
}

export function canPlace(board: Cell[][], piece: ActivePiece): boolean {
  return getBlocks(piece).every(([x, y]) => {
    if (x < 0 || x >= BOARD_WIDTH || y >= TOTAL_HEIGHT) return false;
    if (y < 0) return true;
    return board[y]![x] === null;
  });
}

export function move(state: GameState, dx: number, dy: number): boolean {
  if (state.status !== "playing") return false;
  const moved = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (!canPlace(state.board, moved)) return false;
  state.active = moved;
  if (dy === 0) state.lockAccumulatorMs = 0;
  return true;
}

export function rotate(state: GameState, direction: -1 | 1): boolean {
  if (state.status !== "playing") return false;
  const from = state.active.rotation;
  const to = wrapRotation(from + direction);
  if (state.active.kind === "O") {
    state.active = { ...state.active, rotation: to };
    return true;
  }
  const kicks = getKicks(state.active.kind, from, to);
  for (const [kx, ky] of kicks) {
    const candidate = { ...state.active, rotation: to, x: state.active.x + kx, y: state.active.y - ky };
    if (canPlace(state.board, candidate)) {
      state.active = candidate;
      state.lockAccumulatorMs = 0;
      return true;
    }
  }
  return false;
}

export function hardDrop(state: GameState): number {
  if (state.status !== "playing") return 0;
  let distance = 0;
  while (move(state, 0, 1)) {
    distance += 1;
  }
  lockPiece(state);
  return distance;
}

export function softDrop(state: GameState): boolean {
  const dropped = move(state, 0, 1);
  if (!dropped) lockPiece(state);
  return dropped;
}

export function tick(state: GameState, deltaMs: number, nowMs = performance.now()): void {
  if (state.status !== "playing") return;
  if (state.startedAt === 0) state.startedAt = nowMs;
  state.elapsedMs = nowMs - state.startedAt;
  state.fallAccumulatorMs += deltaMs;

  while (state.fallAccumulatorMs >= state.gravityMs && state.status === "playing") {
    state.fallAccumulatorMs -= state.gravityMs;
    if (!move(state, 0, 1)) {
      state.lockAccumulatorMs += state.gravityMs;
      if (state.lockAccumulatorMs >= state.lockDelayMs) {
        lockPiece(state);
      }
      break;
    }
  }

  updateSinner(state, deltaMs);
  updateGravity(state);
}

export function updateSinner(state: GameState, deltaMs: number): void {
  const sinner = state.sinner;
  sinner.walkAccumulatorMs += deltaMs;
  sinner.fallAccumulatorMs += deltaMs;
  sinner.blinkCooldownMs = Math.max(0, sinner.blinkCooldownMs - deltaMs);

  if (shouldBlink(state)) {
    blinkSinnerUp(state);
  }

  if (sinner.y >= TOTAL_HEIGHT) {
    state.status = "cleared";
    return;
  }

  const fallIntervalMs = 120;
  while (sinner.fallAccumulatorMs >= fallIntervalMs && state.status === "playing") {
    sinner.fallAccumulatorMs -= fallIntervalMs;
    if (sinnerCanOccupy(state, sinner.x, sinner.y + 1)) {
      sinner.y += 1;
      if (sinner.y >= TOTAL_HEIGHT) {
        state.status = "cleared";
        return;
      }
    } else {
      break;
    }
  }

  if (!sinnerIsGrounded(state) || sinner.walkAccumulatorMs < 260) return;
  sinner.walkAccumulatorMs = 0;

  if (!tryWalkSinner(state, sinner.direction)) {
    sinner.direction = sinner.direction === 1 ? -1 : 1;
    tryWalkSinner(state, sinner.direction);
  }
}

export function lockPiece(state: GameState): void {
  if (state.status !== "playing") return;
  if (activeOccupies(state, state.sinner.x, state.sinner.y)) {
    blinkSinnerUp(state);
  }
  for (const [x, y] of getBlocks(state.active)) {
    if (y < HIDDEN_ROWS) {
      state.status = "game-over";
      return;
    }
    state.board[y]![x] = state.active.kind;
  }
  clearLines(state);
  settleSinnerAfterBoardChange(state);
  if (state.status !== "playing") return;
  state.active = spawnPiece(drawNext(state));
  state.canHold = true;
  state.lockAccumulatorMs = 0;
  state.fallAccumulatorMs = 0;
  if (!canPlace(state.board, state.active)) {
    state.status = "game-over";
  }
}

export function clearLines(state: GameState): number {
  const remaining = state.board.filter((row) => row.some((cell) => cell === null));
  const cleared = TOTAL_HEIGHT - remaining.length;
  for (let i = 0; i < cleared; i += 1) {
    remaining.unshift(Array<Cell>(BOARD_WIDTH).fill(null));
  }
  state.board = remaining;
  return cleared;
}

export function hold(state: GameState): boolean {
  if (state.status !== "playing" || !state.canHold) return false;
  const current = state.active.kind;
  if (state.hold === null) {
    state.active = spawnPiece(drawNext(state));
  } else {
    state.active = spawnPiece(state.hold);
  }
  state.hold = current;
  state.canHold = false;
  state.lockAccumulatorMs = 0;
  return canPlace(state.board, state.active);
}

export function ghostPiece(state: GameState): ActivePiece {
  let ghost = { ...state.active };
  while (canPlace(state.board, { ...ghost, y: ghost.y + 1 })) {
    ghost = { ...ghost, y: ghost.y + 1 };
  }
  return ghost;
}

function spawnPiece(kind: PieceKind): ActivePiece {
  return { kind, x: SPAWN_X[kind], y: 0, rotation: 0 };
}

function drawNext(state: GameState): PieceKind {
  fillQueue(state);
  const next = state.queue.shift();
  if (!next) throw new Error("piece queue unexpectedly empty");
  fillQueue(state);
  return next;
}

function fillQueue(state: GameState): void {
  while (state.queue.length < 5) {
    if (state.bag.length === 0) state.bag = shuffledBag(state.rng);
    const next = state.bag.shift();
    if (next) state.queue.push(next);
  }
}

function shuffledBag(rng: RandomSource): PieceKind[] {
  const bag = [...PIECES];
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = tmp;
  }
  return bag;
}

function getKicks(kind: PieceKind, from: Rotation, to: Rotation): ReadonlyArray<readonly [number, number]> {
  const key = `${from}>${to}`;
  return (kind === "I" ? I_KICKS[key] : JLSTZ_KICKS[key]) ?? [[0, 0]];
}

function wrapRotation(value: number): Rotation {
  return (((value % 4) + 4) % 4) as Rotation;
}

function sinnerIsGrounded(state: GameState): boolean {
  return !sinnerCanOccupy(state, state.sinner.x, state.sinner.y + 1);
}

function tryWalkSinner(state: GameState, direction: -1 | 1): boolean {
  const { x, y } = state.sinner;
  const nextX = x + direction;
  if (sinnerCanOccupy(state, nextX, y) && !sinnerCanOccupy(state, nextX, y + 1)) {
    state.sinner.x = nextX;
    return true;
  }

  if (
    !sinnerCanOccupy(state, nextX, y) &&
    sinnerCanOccupy(state, nextX, y - 1) &&
    !activeOccupies(state, nextX, y - 1)
  ) {
    state.sinner.x = nextX;
    state.sinner.y = y - 1;
    return true;
  }

  return false;
}

function sinnerCanOccupy(state: GameState, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_WIDTH) return false;
  if (y >= TOTAL_HEIGHT) return true;
  if (y < 0) return false;
  return state.board[y]?.[x] === null;
}

function shouldBlink(state: GameState): boolean {
  if (state.sinner.blinkCooldownMs > 0) return false;
  const sinnerX = state.sinner.x;
  const sinnerY = state.sinner.y;
  return getBlocks(state.active).some(([x, y]) => x === sinnerX && y >= sinnerY - 1 && y <= sinnerY + 1);
}

function blinkSinnerUp(state: GameState): boolean {
  const blinkDistance = 3;
  for (let distance = blinkDistance; distance >= 1; distance -= 1) {
    const targetY = state.sinner.y - distance;
    if (sinnerCanOccupy(state, state.sinner.x, targetY) && !activeOccupies(state, state.sinner.x, targetY)) {
      state.sinner.y = targetY;
      state.sinner.blinkCooldownMs = 1200;
      state.sinner.fallAccumulatorMs = 0;
      return true;
    }
  }
  return false;
}

function activeOccupies(state: GameState, x: number, y: number): boolean {
  return getBlocks(state.active).some(([blockX, blockY]) => blockX === x && blockY === y);
}

function settleSinnerAfterBoardChange(state: GameState): void {
  if (state.status !== "playing") return;
  if (sinnerCanOccupy(state, state.sinner.x, state.sinner.y)) return;
  if (blinkSinnerUp(state)) return;
  state.status = "cleared";
}

function updateGravity(state: GameState): void {
  const elapsedSeconds = state.elapsedMs / 1000;
  state.gravityMs = Math.max(80, 900 - elapsedSeconds * 12);
}

function seededRng(seed: number): RandomSource {
  let value = seed >>> 0;
  return {
    next() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}
