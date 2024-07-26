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

function initializeBoardCoordinates(board = document.getElementById('board')) {
	if (!board || typeof board.querySelectorAll !== 'function') return false;
	board.setAttribute('role', 'grid');
	board.setAttribute('aria-label', 'Chess board');
	Array.from(board.children || []).forEach(row => {
		if (row.classList && (row.classList.contains('odd') || row.classList.contains('even'))) row.setAttribute('role', 'row');
	});
	let firstSquare = true;
	board.querySelectorAll('.square').forEach(square => {
		const match = /^([1-8])-([a-h])$/.exec(square.getAttribute('data-square') || '');
		if (!match) return;
		const [, rank, file] = match;
		square.dataset.rank = rank;
		square.dataset.file = file;
		square.setAttribute('role', 'gridcell');
		const image = typeof square.querySelector === 'function' ? square.querySelector('img') : null;
		let pieceDescription = '';
		if (image) {
			const pieceMatch = /^(white|black)([A-Z][a-z]+)/.exec(image.id || '');
			if (pieceMatch) {
				pieceDescription = `${pieceMatch[1]} ${pieceMatch[2].replace(/Promoted$/, '').toLowerCase()}`;
				image.setAttribute('alt', pieceDescription);
			}
		}
		square.setAttribute('aria-label', `${file}${rank}${pieceDescription ? `, ${pieceDescription}` : ''}`);
		square.setAttribute('tabindex', firstSquare ? '0' : '-1');
		firstSquare = false;
	});
	return true;
}

initializeBoardCoordinates();
