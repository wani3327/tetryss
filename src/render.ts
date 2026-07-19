import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  Cell,
  HIDDEN_ROWS,
  PieceKind,
  GameState,
  getBlocks,
  getPreviewBlocks,
} from "./tetris.js";
import { requiredNode } from "./utils.js";

const canvas = requiredNode(document.querySelector<HTMLCanvasElement>("#board"), "board canvas");
const context = requiredNode(canvas.getContext("2d"), "2d canvas context");
const timer = requiredNode(document.querySelector<HTMLElement>("#timer"), "timer");
const statusNode = requiredNode(document.querySelector<HTMLElement>("#status"), "status");
const queueNode = requiredNode(document.querySelector<HTMLElement>("#queue"), "queue");
const holdNode = requiredNode(document.querySelector<HTMLElement>("#hold"), "hold");

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

const sinner_sprite = new Image();
sinner_sprite.src = 'resource/스피키.webp';

export function render(state: GameState): void {
  const cellSize = canvas.width / BOARD_WIDTH; // grid cell size by pixel
  context.clearRect(0, 0, canvas.width, canvas.height);

  // draw board
  for (let y = HIDDEN_ROWS; y < state.board.length; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      drawCell(x, y - HIDDEN_ROWS, state.board[y]?.[x] ?? null, cellSize, 1);
    }
  }

  // draw ghost
  for (const [x, y] of getBlocks(state.ghostPiece())) {
    if (y >= HIDDEN_ROWS) drawCell(x, y - HIDDEN_ROWS, state.active.kind, cellSize, 0.22);
  }

  // draw active piece
  for (const [x, y] of getBlocks(state.active)) {
    if (y >= HIDDEN_ROWS) drawCell(x, y - HIDDEN_ROWS, state.active.kind, cellSize, 1);
  }

  drawSinner(state.sinner.x, state.sinner.y, cellSize);
  drawGrid(cellSize);
  
  timer.textContent = (state.elapsedMs / 1000).toFixed(2);
  statusNode.textContent = state.status === "game-over" ? "Game over" : state.status === "cleared" ? "Cleared" : "Playing";
  queueNode.replaceChildren(...state.queue.slice(0, 5).map(renderQueuePiece));
  holdNode.replaceChildren(state.holdPiece === null ? renderEmptyPreview() : renderQueuePiece(state.holdPiece));
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

function drawSinner(positionX: number, positionY: number, size: number): void {
  const visibleY = positionY - HIDDEN_ROWS;
  if (visibleY < 0 || visibleY >= BOARD_HEIGHT) return;
  const centerX = positionX * size;
  const centerY = visibleY * size;

  context.save();
  context.drawImage(sinner_sprite, centerX, centerY, size, size);
  // context.fillStyle = "#f8f6f2";
  // context.beginPath();
  // context.arc(centerX, centerY, size * 0.38, 0, Math.PI * 2);
  // context.fill();
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

