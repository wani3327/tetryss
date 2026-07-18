# Project goal
- Simple web game based on Tetris Cheese Race.
- Game includes a Tetris board, and an NPC(sinner).
- Player's goal is to clear lines, which are foothold of the sinner, in order to drop them into abyss.

# Game loop
## Initial status
- The game is spawned with 10 lines of Cheese Race line. (A line lacks only one block to be filled)
- Sinner is spawned on the top center of board.

## Player behaviour
- Play Tetris with almost no restiction.

### Controls
- Arrow keys for horizontal move
- Z, X for CCW/CW rotation

## Sinner behaviour
- Tries to survive from hell.
- Able to walk horizontally, and jump one block.
- Able to break a tetrimino in one block distance horizontally or diagonally
- Able to blink short distance up. Sinner only uses this when they are about to be crushed by dropping Tetrimino.

## Termination
- When sinner hit the bottom of the board, game is cleared.
- The time took so far is score.
- When Tetrimino hits the top of the board, game is over.

## Tetris Rules
- Follow modern tetris rule, which allows Super Rotation System.
- Omit any scoring systems
- Block drop faster as game 

# Visual Designs
## UI
- Tetris board at middle
- Attach five panels on top-right side of board to show next Tetriminos.
- Hold panel just under the next panel
- Stopwatch on top-left side of board

## Concepts
- Total visual is inspired by world of hell.
- Player, 염라대왕, tries to punish sinner.
- The bottom of board is abyss. Even Tetriminos stop there, keep sinners pass through the line and drop them out of monitor when game finishes.