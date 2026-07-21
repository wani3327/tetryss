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

export class GameState {
  board: Cell[][];
  active: ActivePiece;
  sinner: Sinner;
  holdPiece: PieceKind | null;
  canHold: boolean;
  queue: PieceKind[];
  bag: PieceKind[];
  status: GameStatus;
  hardMode: boolean;
  startedAt: number;
  elapsedMs: number;
  lockDelayMs: number;
  gravityMs: number;
  fallAccumulatorMs: number;
  lockAccumulatorMs: number;
  rng: RandomSource;

  constructor(hardmode: boolean) {
    this.rng = seededRng(Date.now());
    this.board = createCheeseBoard(this.rng);
    this.sinner = spawnSinner();
    this.holdPiece = null;
    this.canHold = true;
    this.queue = [];
    this.bag = [];
    this.status = "playing";
    this.hardMode = hardmode;
    this.startedAt = 0;
    this.elapsedMs = 0;
    this.lockDelayMs = 500;
    this.gravityMs = 900;
    this.fallAccumulatorMs = 0;
    this.lockAccumulatorMs = 0;
    this.fillQueue();
    this.active = spawnPiece(this.drawNext());
  }

  fillQueue(): void {
    while (this.queue.length < 5) {
      if (this.bag.length === 0) this.bag = shuffledBag(this.rng);
      const next = this.bag.shift();
      if (next) this.queue.push(next);
    }
  }

  drawNext(): PieceKind {
    this.fillQueue();
    const next = this.queue.shift();
    if (!next) throw new Error("piece queue unexpectedly empty");
    this.fillQueue();
    return next;
  }


  move(dx: number, dy: number): boolean {
    if (this.status !== "playing") return false;
    const moved = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (!canPlace(this.board, moved)) return false;
    this.active = moved;
    if (dy === 0) this.lockAccumulatorMs = 0;
    return true;
  }

  rotate(direction: -1 | 1): boolean {
    if (this.status !== "playing") return false;
    const from = this.active.rotation;
    const to = wrapRotation(from + direction);
    if (this.active.kind === "O") {
      this.active = { ...this.active, rotation: to };
      return true;
    }
    const kicks = getKicks(this.active.kind, from, to);
    for (const [kx, ky] of kicks) {
      const candidate = { ...this.active, rotation: to, x: this.active.x + kx, y: this.active.y - ky };
      if (canPlace(this.board, candidate)) {
        this.active = candidate;
        this.lockAccumulatorMs = 0;
        return true;
      }
    }
    return false;
  }

  hardDrop(): number {
    if (this.status !== "playing") return 0;
    let distance = 0;
    while (this.move(0, 1)) {
      distance += 1;
    }
    this.lockPiece();
    return distance;
  }

  hold(): boolean {
    if (this.status !== "playing" || !this.canHold) return false;
    const current = this.active.kind;
    if (this.holdPiece === null) {
      this.active = spawnPiece(this.drawNext());
    } else {
      this.active = spawnPiece(this.holdPiece);
    }
    this.holdPiece = current;
    this.canHold = false;
    this.lockAccumulatorMs = 0;
    return canPlace(this.board, this.active);
  }

  tick(deltaMs: number, nowMs = performance.now()): void {
    if (this.status !== "playing") return;
    if (this.startedAt === 0) this.startedAt = nowMs;
    this.elapsedMs = nowMs - this.startedAt;
    this.fallAccumulatorMs += deltaMs;

    while (this.fallAccumulatorMs >= this.gravityMs && this.status === "playing") {
      this.fallAccumulatorMs -= this.gravityMs;
      if (!this.move(0, 1)) {
        this.lockAccumulatorMs += this.gravityMs;
        if (this.lockAccumulatorMs >= this.lockDelayMs) {
          this.lockPiece();
        }
        break;
      }
    }

    this.updateSinner(deltaMs);
    this.updateGravity();
  }


  updateSinner(deltaMs: number): void {
    const sinner = this.sinner;
    sinner.walkAccumulatorMs += deltaMs;
    sinner.fallAccumulatorMs += deltaMs;
    sinner.blinkCooldownMs = Math.max(0, sinner.blinkCooldownMs - deltaMs);

    if (this.shouldBlink()) {
      this.blinkSinnerUp();
    }

    if (sinner.y >= TOTAL_HEIGHT) {
      this.status = "cleared";
      return;
    }

    const fallIntervalMs = 120;
    while (sinner.fallAccumulatorMs >= fallIntervalMs && this.status === "playing") {
      sinner.fallAccumulatorMs -= fallIntervalMs;
      if (this.sinnerCanOccupy(sinner.x, sinner.y + 1)) {
        sinner.y += 1;
        if (sinner.y >= TOTAL_HEIGHT) {
          this.status = "cleared";
          return;
        }
      } else {
        break;
      }
    }

    if (!this.sinnerIsGrounded() || sinner.walkAccumulatorMs < 260) return;
    sinner.walkAccumulatorMs = 0;

    if (this.hardMode && this.tryHardModeSinnerAction()) return;

    if (!this.tryWalkSinner(sinner.direction)) {
      sinner.direction = sinner.direction === 1 ? -1 : 1;
      this.tryWalkSinner(sinner.direction);
    }
  }

  lockPiece(): void {
    if (this.status !== "playing") return;
    if (this.activeOccupies(this.sinner.x, this.sinner.y)) {
      this.blinkSinnerUp();
    }
    for (const [x, y] of getBlocks(this.active)) {
      if (y < HIDDEN_ROWS) {
        this.status = "game-over";
        return;
      }
      this.board[y]![x] = this.active.kind;
    }
    this.clearLines();
    this.settleSinnerAfterBoardChange();
    if (this.status !== "playing") return;
    this.active = spawnPiece(this.drawNext());
    this.canHold = true;
    this.lockAccumulatorMs = 0;
    this.fallAccumulatorMs = 0;
    if (!canPlace(this.board, this.active)) {
      this.status = "game-over";
    }
  }

  clearLines(): number {
    const remaining = this.board.filter((row) => row.some((cell) => cell === null));
    const cleared = TOTAL_HEIGHT - remaining.length;
    for (let i = 0; i < cleared; i += 1) {
      remaining.unshift(Array<Cell>(BOARD_WIDTH).fill(null));
    }
    this.board = remaining;
    return cleared;
  }


  ghostPiece(): ActivePiece {
    let ghost = { ...this.active };
    while (canPlace(this.board, { ...ghost, y: ghost.y + 1 })) {
      ghost = { ...ghost, y: ghost.y + 1 };
    }
    return ghost;
  }


  sinnerIsGrounded(): boolean {
    return !this.sinnerCanOccupy(this.sinner.x, this.sinner.y + 1);
  }

  tryWalkSinner(direction: -1 | 1): boolean {
    const { x, y } = this.sinner;
    const nextX = x + direction;
    if (this.sinnerCanOccupy(nextX, y) && !this.sinnerCanOccupy(nextX, y + 1)) {
      this.sinner.x = nextX;
      return true;
    }

    if (
      !this.sinnerCanOccupy(nextX, y) &&
      this.sinnerCanOccupy(nextX, y - 1) &&
      !this.activeOccupies(nextX, y - 1)
    ) {
      this.sinner.x = nextX;
      this.sinner.y = y - 1;
      return true;
    }

    return false;
  }

  tryHardModeSinnerAction(): boolean {
    const directions = [this.sinner.direction, (this.sinner.direction === 1 ? -1 : 1) as -1 | 1];

    for (const direction of directions) {
      if (this.tryClimbSinner(direction)) return true;
    }

    for (const direction of directions) {
      const stepX = this.sinner.x + direction;
      if (this.hasLockedTile(stepX, this.sinner.y) && this.breakLockedTile(stepX, this.sinner.y - 1)) {
        this.sinner.direction = direction;
        return true;
      }
    }

    for (const [x, y] of [
      [this.sinner.x, this.sinner.y - 1],
      [this.sinner.x + this.sinner.direction, this.sinner.y],
      [this.sinner.x - this.sinner.direction, this.sinner.y],
    ] as const) {
      if (this.breakLockedTile(x, y)) return true;
    }

    return false;
  }

  tryClimbSinner(direction: -1 | 1): boolean {
    const { x, y } = this.sinner;
    const nextX = x + direction;
    const nextY = y - 1;
    if (
      !this.sinnerCanOccupy(nextX, y) &&
      this.sinnerCanOccupy(nextX, nextY) &&
      !this.activeOccupies(nextX, nextY)
    ) {
      this.sinner.x = nextX;
      this.sinner.y = nextY;
      this.sinner.direction = direction;
      return true;
    }

    return false;
  }

  breakLockedTile(x: number, y: number): boolean {
    if (!this.hasLockedTile(x, y) || this.activeOccupies(x, y)) return false;
    this.board[y]![x] = null;
    this.settleSinnerAfterBoardChange();
    return true;
  }

  hasLockedTile(x: number, y: number): boolean {
    if (x < 0 || x >= BOARD_WIDTH || y < HIDDEN_ROWS || y >= TOTAL_HEIGHT) return false;
    return this.board[y]?.[x] !== null;
  }

  sinnerCanOccupy(x: number, y: number): boolean {
    if (x < 0 || x >= BOARD_WIDTH) return false;
    if (y >= TOTAL_HEIGHT) return true;
    if (y < 0) return false;
    return this.board[y]?.[x] === null;
  }

  shouldBlink(): boolean {
    if (this.sinner.blinkCooldownMs > 0) return false;
    const sinnerX = this.sinner.x;
    const sinnerY = this.sinner.y;
    return getBlocks(this.active).some(([x, y]) => x === sinnerX && y >= sinnerY - 1 && y <= sinnerY + 1);
  }

  blinkSinnerUp(): boolean {
    const blinkDistance = 4;
    for (let distance = blinkDistance; distance >= 1; distance -= 1) {
      const targetY = this.sinner.y - distance;
      if (this.sinnerCanOccupy(this.sinner.x, targetY) && !this.activeOccupies(this.sinner.x, targetY)) {
        this.sinner.y = targetY;
        this.sinner.blinkCooldownMs = 1200;
        this.sinner.fallAccumulatorMs = 0;
        return true;
      }
    }
    return false;
  }

  activeOccupies(x: number, y: number): boolean {
    return getBlocks(this.active).some(([blockX, blockY]) => blockX === x && blockY === y);
  }

  settleSinnerAfterBoardChange(): void {
    if (this.status !== "playing") return;
    if (this.sinnerCanOccupy(this.sinner.x, this.sinner.y)) return;
    if (this.blinkSinnerUp()) return;
    this.status = "cleared";
  }

  updateGravity(): void {
    const elapsedSeconds = this.elapsedMs / 1000;
    this.gravityMs = Math.max(80, 900 - elapsedSeconds * 12);
  }


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

function spawnPiece(kind: PieceKind): ActivePiece {
  return { kind, x: SPAWN_X[kind], y: 0, rotation: 0 };
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
