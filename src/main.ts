import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  Cell,
  HIDDEN_ROWS,
  PieceKind,
  createGame,
  getBlocks,
  getPreviewBlocks,
  ghostPiece,
  hardDrop,
  hold,
  move,
  rotate,
  softDrop,
  tick,
} from "./tetris.js";

const canvas = requiredNode(document.querySelector<HTMLCanvasElement>("#board"), "board canvas");
const timer = requiredNode(document.querySelector<HTMLElement>("#timer"), "timer");
const statusNode = requiredNode(document.querySelector<HTMLElement>("#status"), "status");
const queueNode = requiredNode(document.querySelector<HTMLElement>("#queue"), "queue");
const holdNode = requiredNode(document.querySelector<HTMLElement>("#hold"), "hold");
const context = requiredNode(canvas.getContext("2d"), "2d canvas context");

const colors: Record<Exclude<Cell, null>, string> = {
  I: "#46c7d9",
  J: "#416ad9",
  L: "#d98430",
  O: "#dfc23a",
  S: "#5fc76d",
  T: "#a55ad9",
  Z: "#d95757",
  cheese: "#7b6352",
};

const state = createGame();
let lastFrame = performance.now();

window.addEventListener("keydown", (event) => {
  // if (event.repeat) return;
  switch (event.key) {
    case "ArrowLeft":
      move(state, -1, 0);
      break;
    case "ArrowRight":
      move(state, 1, 0);
      break;
    case "ArrowDown":
      softDrop(state);
      break;
    case " ":
      hardDrop(state);
      break;
    case "z":
    case "Z":
      rotate(state, -1);
      break;
    case "x":
    case "X":
    case "ArrowUp":
      rotate(state, 1);
      break;
    case "c":
    case "C":
      hold(state);
      break;
    default:
      return;
  }
  event.preventDefault();
  render();
});

function frame(now: number): void {
  tick(state, now - lastFrame, now);
  lastFrame = now;
  render();
  requestAnimationFrame(frame);
}

function render(): void {
  const cellSize = canvas.width / BOARD_WIDTH;
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = HIDDEN_ROWS; y < state.board.length; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      drawCell(x, y - HIDDEN_ROWS, state.board[y]?.[x] ?? null, cellSize, 1);
    }
  }

  for (const [x, y] of getBlocks(ghostPiece(state))) {
    if (y >= HIDDEN_ROWS) drawCell(x, y - HIDDEN_ROWS, state.active.kind, cellSize, 0.22);
  }

  for (const [x, y] of getBlocks(state.active)) {
    if (y >= HIDDEN_ROWS) drawCell(x, y - HIDDEN_ROWS, state.active.kind, cellSize, 1);
  }

  drawSinner(cellSize);
  drawGrid(cellSize);
  timer.textContent = (state.elapsedMs / 1000).toFixed(2);
  statusNode.textContent = state.status === "game-over" ? "Game over" : state.status === "cleared" ? "Cleared" : "Playing";
  queueNode.replaceChildren(...state.queue.slice(0, 5).map(renderQueuePiece));
  holdNode.replaceChildren(state.hold === null ? renderEmptyPreview() : renderQueuePiece(state.hold));
}

function drawCell(x: number, visibleY: number, cell: Cell, size: number, alpha: number): void {
  if (!cell || visibleY < 0 || visibleY >= BOARD_HEIGHT) return;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = colors[cell];
  context.fillRect(x * size + 1, visibleY * size + 1, size - 2, size - 2);
  context.restore();
}

function drawGrid(size: number): void {
  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 1;
  for (let x = 0; x <= BOARD_WIDTH; x += 1) {
    context.beginPath();
    context.moveTo(x * size, 0);
    context.lineTo(x * size, canvas.height);
    context.stroke();
  }
  for (let y = 0; y <= BOARD_HEIGHT; y += 1) {
    context.beginPath();
    context.moveTo(0, y * size);
    context.lineTo(canvas.width, y * size);
    context.stroke();
  }
}

function drawSinner(size: number): void {
  const visibleY = state.sinner.y - HIDDEN_ROWS;
  if (visibleY < 0 || visibleY >= BOARD_HEIGHT) return;
  const centerX = state.sinner.x * size + size / 2;
  const centerY = visibleY * size + size / 2;
  context.save();
  context.fillStyle = "#f8f6f2";
  context.beginPath();
  context.arc(centerX, centerY, size * 0.38, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function renderQueuePiece(kind: PieceKind): HTMLElement {
  const preview = document.createElement("canvas");
  preview.width = 72;
  preview.height = 72;
  preview.className = "piece-preview";
  preview.title = kind;

  const previewContext = requiredNode(preview.getContext("2d"), "preview context");
  const blocks = getPreviewBlocks(kind);
  const minX = Math.min(...blocks.map(([x]) => x));
  const maxX = Math.max(...blocks.map(([x]) => x));
  const minY = Math.min(...blocks.map(([, y]) => y));
  const maxY = Math.max(...blocks.map(([, y]) => y));
  const blockSize = 16;
  const offsetX = (preview.width - (maxX - minX + 1) * blockSize) / 2 - minX * blockSize;
  const offsetY = (preview.height - (maxY - minY + 1) * blockSize) / 2 - minY * blockSize;

  for (const [x, y] of blocks) {
    previewContext.fillStyle = colors[kind];
    previewContext.fillRect(offsetX + x * blockSize + 1, offsetY + y * blockSize + 1, blockSize - 2, blockSize - 2);
  }

  return preview;
}

function renderEmptyPreview(): HTMLElement {
  const node = document.createElement("div");
  node.className = "piece-preview empty";
  return node;
}

function requiredNode<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`missing ${name}`);
  return value;
}

requestAnimationFrame(frame);
