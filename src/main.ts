import {
  createGame,
  hardDrop,
  hold,
  move,
  rotate,
  softDrop,
  tick,
} from "./tetris.js";
import { render } from "./render.js";

const state = createGame();
let lastFrame = performance.now();

window.addEventListener("keydown", (event) => {
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
});

function frame(now: number): void {
  tick(state, now - lastFrame, now);
  lastFrame = now;
  render(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
