## JS 2D Chess Game

This is a complete well automated multi-player chess game implemented in HTML5, CSS, and JavaScript. 

![Gameplay Screenshot](screenshots/gameplay.png)
_The game in action._

## Features

- Responsive design, compatible with different screen sizes
- Flip Board control to change viewpoints without changing square or piece identities
- Algebraic rank/file coordinates and screen-reader names remain attached to the same squares when the board is flipped
- Distinguishes the selected piece from its legal destinations and announces the destination squares to screen readers
- Uses separate markers and spoken labels for quiet moves, captures, en passant, and castling
- Highlights the previous move's origin and destination; castling marks both king and rook squares, with checked-king styling kept distinct
- Moves validations
- Animated display of checkmate and winner
- Undo and redo controls with Ctrl/Cmd+Z, Ctrl/Cmd+Y, and Ctrl/Cmd+Shift+Z shortcuts
- New Game action that confirms before discarding a game with recorded progress
- Resignation with confirmation, an announced result, locked terminal controls, and a restart action

## Installation

1. Clone the repository: `git clone https://github.com/davymaish/2d-chess-game.git`
2. Open the `index.html` file in your preferred web browser.

## How to Play

1. Open the game in your web browser.
2. Click a piece to see the selected square and legal destinations highlighted differently; capture and special-move targets use their own markers, screen readers announce each square and move type, and the previous move remains highlighted.
3. Use Flip Board to view the same position from the opposite side; the coordinates, square names, selection, and legal-move markers stay associated with their original squares.
4. Select a square and the piece will move to that square.
5. Use the Undo and Redo buttons, or Ctrl/Cmd+Z and Ctrl/Cmd+Y (Ctrl/Cmd+Shift+Z also redoes), to navigate recent moves.
6. Choose New Game to reset the board; confirm first if the current game has progress.
7. Choose Resign and confirm to end the game; the result screen offers a new-game action.
8. The game displays the winner when the king is checked.

## Running Tests

The movement regression tests use Node.js's built-in test runner and require no additional dependencies. With Node.js 18 or newer installed, run:

```sh
npm test
```

## Contributing

Contributions are welcome! If you find any issues or have ideas for improvements, please open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

## Credits and Acknowledgements

The chess pieces images are downloaded from [Pixabay](https://pixabay.com/).

## Contact

For any inquiries or feedback, feel free to contact me via:

- Website: [davymaish.github.io](https://davymaish.github.io)
- Email: [davymaish6@gmail.com](mailto:davymaish6@gmail.com)
