import {
  GameState,
} from "./tetris.js";
import { render } from "./render.js";

const DAS = 133;
const ARR = 10;
const SDF = 0;

const state = new GameState();
let lastFrame = performance.now();

let inputState: {
 key: string | null;
 when: number;
 state: number;
} = {key: null, when: lastFrame, state: 0};

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowDown":
      console.log(event.key);
      inputState = {key: event.key, when: lastFrame, state: 0};
      handleMove(0);
      break;
    case " ":
      state.hardDrop();
      break;
    case "z":
    case "Z":
      state.rotate(-1);
      break;
    case "x":
    case "X":
    case "ArrowUp":
      state.rotate(1);
      break;
    case "c":
    case "C":
      state.hold();
      break;
    default:
      return;
  }
  event.preventDefault();
});

window.addEventListener("keyup", (_) => {
  inputState = {key: null, when: lastFrame, state: 0};
});

function handleMove(now: number) {
  switch (inputState.key) {
    case "ArrowLeft":
      foo(() => state.move(-1, 0), DAS, ARR);
      break;
    case "ArrowRight":
      foo(() => state.move(1, 0), DAS, ARR);
      break;
    case "ArrowDown":
      foo(() => state.move(0, 1), 0, SDF);
      break;
    default:
      return;
  }

  function foo(action: () => void, das: number, arr: number) {
    switch (inputState.state) {
      case 0:
      action();
      inputState.state = 1;
      break;
    case 1:
      if (now - inputState.when > das) {
        inputState.state = 2;
        inputState.when += DAS;
      }
      break;
    case 2:
      while (now - inputState.when > arr) {
        action();
        inputState.when += ARR;
      }
    }
  }
}

function frame(now: number): void {
  handleMove(now);
  state.tick(now - lastFrame, now);
  lastFrame = now;
  render(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
