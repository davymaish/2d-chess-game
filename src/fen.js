const FEN_PIECE_LETTERS = {
	king: 'k',
	queen: 'q',
	rook: 'r',
	bishop: 'b',
	knight: 'n',
	pawn: 'p',
};

function fenSquareName(position) {
	const value = Number(position);
	const rank = Math.floor(value / 10);
	const file = value % 10;
	if (!Number.isInteger(value) || rank < 1 || rank > 8 || file < 1 || file > 8) {
		throw new TypeError(`Invalid board square for FEN: ${position}`);
	}
	return `${String.fromCharCode(96 + file)}${rank}`;
}

function fenCastlingRights(pieces) {
	let rights = '';
	for (const color of ['white', 'black']) {
		const homeRank = color === 'white' ? 1 : 8;
		const king = pieces.find(piece => piece.name === `${color}King`);
		if (!king || king.rank !== 'king' || king.color !== color || Number(king.position) !== homeRank * 10 + 5 || king.ableToCastle !== true) continue;
		const queenRook = pieces.find(piece => piece.name === `${color}Rook1`);
		const kingRook = pieces.find(piece => piece.name === `${color}Rook2`);
		if (kingRook && kingRook.rank === 'rook' && kingRook.color === color && Number(kingRook.position) === homeRank * 10 + 8 && kingRook.ableToCastle === true) {
			rights += color === 'white' ? 'K' : 'k';
		}
		if (queenRook && queenRook.rank === 'rook' && queenRook.color === color && Number(queenRook.position) === homeRank * 10 + 1 && queenRook.ableToCastle === true) {
			rights += color === 'white' ? 'Q' : 'q';
		}
	}
	return rights || '-';
}

function serializeGameToFEN(game) {
	if (!game || typeof game !== 'object' || !Array.isArray(game.pieces)) {
		throw new TypeError('FEN export requires a game with a pieces array.');
	}
	if (!['white', 'black'].includes(game.turn)) throw new TypeError('FEN active color must be white or black.');
	const halfmoveClock = game.halfmoveClock ?? 0;
	if (!Number.isInteger(halfmoveClock) || halfmoveClock < 0) throw new TypeError('FEN half-move clock must be a non-negative integer.');
	const moveHistory = game.moveHistory ?? [];
	if (!Array.isArray(moveHistory)) throw new TypeError('FEN move history must be an array.');
	const fullmoveNumber = game.fullmoveNumber ?? Math.floor(moveHistory.length / 2) + 1;
	if (!Number.isInteger(fullmoveNumber) || fullmoveNumber < 1) throw new TypeError('FEN full-move number must be a positive integer.');

	const board = new Map();
	for (const piece of game.pieces) {
		if (!piece || !Object.hasOwn(FEN_PIECE_LETTERS, piece.rank) || !['white', 'black'].includes(piece.color)) {
			throw new TypeError('FEN pieces must have a recognized rank and color.');
		}
		const position = Number(piece.position);
		fenSquareName(position);
		if (board.has(position)) throw new TypeError(`FEN position ${position} contains more than one piece.`);
		const letter = FEN_PIECE_LETTERS[piece.rank];
		board.set(position, piece.color === 'white' ? letter.toUpperCase() : letter);
	}

	const ranks = [];
	for (let rank = 8; rank >= 1; rank--) {
		let row = '';
		let emptyCount = 0;
		for (let file = 1; file <= 8; file++) {
			const letter = board.get(rank * 10 + file);
			if (letter) {
				if (emptyCount) row += emptyCount;
				row += letter;
				emptyCount = 0;
			}
			else emptyCount++;
		}
		if (emptyCount) row += emptyCount;
		ranks.push(row);
	}

	let enPassant = '-';
	if (game.enPassantTarget != null) {
		const target = Number(game.enPassantTarget);
		fenSquareName(target);
		const expectedRank = game.turn === 'black' ? 3 : 6;
		if (Math.floor(target / 10) !== expectedRank) throw new TypeError('FEN en-passant target rank does not match the active color.');
		enPassant = fenSquareName(target);
	}
	return `${ranks.join('/')} ${game.turn === 'white' ? 'w' : 'b'} ${fenCastlingRights(game.pieces)} ${enPassant} ${halfmoveClock} ${fullmoveNumber}`;
}
