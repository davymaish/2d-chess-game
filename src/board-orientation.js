function boardAnimate() {
	const board = document.getElementById('board');
	if (!board) return null;

	const currentOrientation = board.dataset.orientation || 'white';
	const nextOrientation = currentOrientation === 'white' ? 'black' : 'white';
	const isFlipped = nextOrientation === 'black';
	const animationToPlay = isFlipped ? 'animate' : 'animate-backward';
	const animationToClear = isFlipped ? 'animate-backward' : 'animate';
	const pieces = board.querySelectorAll('.piece');

	board.classList.remove(animationToClear);
	board.classList.remove(animationToPlay);
	void board.offsetWidth;
	board.classList.add(animationToPlay);
	pieces.forEach(piece => {
		piece.classList.remove(isFlipped ? 'backward' : 'forward');
		piece.classList.add(isFlipped ? 'forward' : 'backward');
	});
	board.dataset.orientation = nextOrientation;

	const button = document.getElementById('flip-board');
	if (button) button.setAttribute('aria-pressed', String(isFlipped));
	return nextOrientation;
}
