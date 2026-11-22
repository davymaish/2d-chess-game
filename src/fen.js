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

function parseGameFEN(fen) {
	if (typeof fen !== 'string' || fen.trim() === '') throw new TypeError('FEN must be a non-empty string.');
	const fields = fen.trim().split(/\s+/);
	if (fields.length !== 6) throw new TypeError('FEN must contain exactly six fields.');
	const [placement, activeColor, castlingField, enPassantField, halfmoveField, fullmoveField] = fields;
	if (activeColor !== 'w' && activeColor !== 'b') throw new TypeError('FEN active color must be w or b.');
	const turn = activeColor === 'w' ? 'white' : 'black';
	if (castlingField !== '-' && (!/^[KQkq]+$/.test(castlingField) || new Set(castlingField).size !== castlingField.length)) {
		throw new TypeError('FEN castling rights must be -, or unique KQkq symbols.');
	}
	const castlingRights = castlingField === '-' ? '' : ['K', 'Q', 'k', 'q'].filter(right => castlingField.includes(right)).join('');
	let enPassantTarget = null;
	if (enPassantField !== '-') {
		if (!/^[a-h][36]$/.test(enPassantField)) throw new TypeError('FEN en-passant target must be -, or a square on rank 3 or 6.');
		const rank = Number(enPassantField[1]);
		if (rank !== (turn === 'black' ? 3 : 6)) throw new TypeError('FEN en-passant target rank does not match the active color.');
		enPassantTarget = rank * 10 + enPassantField.charCodeAt(0) - 96;
	}
	if (!/^(0|[1-9]\d*)$/.test(halfmoveField)) throw new TypeError('FEN half-move clock must be a non-negative integer.');
	if (!/^[1-9]\d*$/.test(fullmoveField)) throw new TypeError('FEN full-move number must be a positive integer.');
	const halfmoveClock = Number(halfmoveField);
	const fullmoveNumber = Number(fullmoveField);
	if (!Number.isSafeInteger(halfmoveClock) || !Number.isSafeInteger(fullmoveNumber)) throw new TypeError('FEN move counters exceed the supported integer range.');

	const rows = placement.split('/');
	if (rows.length !== 8) throw new TypeError('FEN piece placement must contain eight ranks.');
	const rawPieces = [];
	for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
		let file = 1;
		for (const symbol of rows[rowIndex]) {
			if (/^[1-8]$/.test(symbol)) file += Number(symbol);
			else {
				const rank = Object.keys(FEN_PIECE_LETTERS).find(pieceRank => FEN_PIECE_LETTERS[pieceRank] === symbol.toLowerCase());
				if (!rank || file > 8) throw new TypeError(`Invalid piece placement symbol: ${symbol}`);
				rawPieces.push({ rank, color: symbol === symbol.toUpperCase() ? 'white' : 'black', position: (8 - rowIndex) * 10 + file });
				file++;
			}
			if (file > 9) throw new TypeError(`FEN rank ${8 - rowIndex} has too many squares.`);
		}
		if (file !== 9) throw new TypeError(`FEN rank ${8 - rowIndex} must describe exactly eight squares.`);
	}

	const usedNames = new Set();
	const namedPieces = rawPieces.map(piece => {
		const { color, rank, position } = piece;
		const homeRank = color === 'white' ? 1 : 8;
		const file = position % 10;
		const rightsByColor = color === 'white' ? ['K', 'Q'] : ['k', 'q'];
		let name;
			if (rank === 'king') name = `${color}King`;
			else if (rank === 'rook' && Math.floor(position / 10) === homeRank && file === 1 && castlingRights.includes(rightsByColor[1])) name = `${color}Rook1`;
			else if (rank === 'rook' && Math.floor(position / 10) === homeRank && file === 8 && castlingRights.includes(rightsByColor[0])) name = `${color}Rook2`;
			else if (rank === 'pawn' && Math.floor(position / 10) === (color === 'white' ? 2 : 7)) name = `${color}Pawn${file}`;
			if (!name) {
				const base = `${color}${rank.charAt(0).toUpperCase()}${rank.slice(1)}`;
				if (rank === 'queen' && !usedNames.has(base)) name = base;
				else if (rank === 'queen') {
					let suffix = 1;
					while (usedNames.has(`${base}Promoted${suffix}`)) suffix++;
					name = `${base}Promoted${suffix}`;
				}
				else if (['rook', 'pawn', 'bishop', 'knight'].includes(rank)) {
					const limit = rank === 'pawn' ? 8 : 2;
					const indices = rank === 'pawn' ? [file, ...Array.from({ length: 8 }, (_, index) => index + 1).filter(index => index !== file)] : Array.from({ length: limit }, (_, index) => index + 1);
					for (const index of indices) {
					if (!usedNames.has(`${base}${index}`)) {
						name = `${base}${index}`;
						break;
					}
				}
			}
			if (!name) {
				let suffix = 1;
				while (usedNames.has(`${base}FEN${suffix}`)) suffix++;
				name = `${base}FEN${suffix}`;
			}
		}
		if (usedNames.has(name)) {
			let suffix = 1;
			while (usedNames.has(`${name}FEN${suffix}`)) suffix++;
			name = `${name}FEN${suffix}`;
		}
		usedNames.add(name);
		const canCastle = rank === 'king'
			? rightsByColor.some(right => castlingRights.includes(right))
			: rank === 'rook' && ((file === 1 && Math.floor(position / 10) === homeRank && castlingRights.includes(rightsByColor[1])) ||
				(file === 8 && Math.floor(position / 10) === homeRank && castlingRights.includes(rightsByColor[0])));
		return { ...piece, name, ...(rank === 'king' || rank === 'rook' ? { ableToCastle: canCastle } : {}) };
	});
	return { pieces: namedPieces, turn, castlingRights: castlingRights || '-', enPassantTarget, halfmoveClock, fullmoveNumber };
}
