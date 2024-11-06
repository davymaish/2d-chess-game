const GAME_SAVE_SCHEMA = '2d-chess-game';
const GAME_SAVE_VERSION = 1;
const MAX_GAME_SAVE_BYTES = 256 * 1024;
const GAME_SAVE_COLORS = new Set(['white', 'black']);
const GAME_SAVE_RANKS = new Set(['king', 'queen', 'rook', 'bishop', 'knight', 'pawn']);

function isGameSaveObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isGameBoardPosition(value) {
	if (!Number.isInteger(value)) return false;
	const rank = Math.floor(value / 10);
	const file = value % 10;
	return rank >= 1 && rank <= 8 && file >= 1 && file <= 8;
}

function gameSaveByteLength(value) {
	return new TextEncoder().encode(value).byteLength;
}

function isGamePositionKey(value) {
	if (typeof value !== 'string' || value.length > 4096) return false;
	try {
		const key = JSON.parse(value);
		return Array.isArray(key) && key.length === 4 &&
			GAME_SAVE_COLORS.has(key[0]) && typeof key[1] === 'string' &&
			typeof key[2] === 'string' && (key[3] === null || isGameBoardPosition(key[3]));
	}
	catch {
		return false;
	}
}

function validateGameSave(save) {
	const errors = [];
	if (!isGameSaveObject(save)) return ['Save must be a JSON object.'];
	if (save.schema !== GAME_SAVE_SCHEMA) errors.push('Save schema is not recognized.');
	if (save.version !== GAME_SAVE_VERSION) errors.push(`Save version must be ${GAME_SAVE_VERSION}.`);
	if (typeof save.savedAt !== 'string' || Number.isNaN(Date.parse(save.savedAt))) errors.push('Save timestamp must be a valid date string.');
	if (save.version !== GAME_SAVE_VERSION) return errors;
	if (!isGameSaveObject(save.state)) {
		errors.push('Save state must be an object.');
		return errors;
	}

	const state = save.state;
	if (!GAME_SAVE_COLORS.has(state.turn)) errors.push('Turn must be white or black.');
	if (!Array.isArray(state.pieces) || state.pieces.length < 2 || state.pieces.length > 32) {
		errors.push('A save must contain between 2 and 32 pieces.');
	}
	else {
		const names = new Set();
		const positions = new Set();
		const kings = { white: 0, black: 0 };
		for (const [index, piece] of state.pieces.entries()) {
			if (!isGameSaveObject(piece)) {
				errors.push(`Piece ${index + 1} must be an object.`);
				continue;
			}
			if (typeof piece.name !== 'string' || !/^(white|black)[A-Za-z][A-Za-z0-9_-]*$/.test(piece.name)) {
				errors.push(`Piece ${index + 1} has an invalid identity.`);
			}
			else {
				if (names.has(piece.name)) errors.push(`Piece identity ${piece.name} is duplicated.`);
				names.add(piece.name);
			}
			if (!GAME_SAVE_COLORS.has(piece.color) || (typeof piece.name === 'string' && !piece.name.startsWith(piece.color))) {
				errors.push(`Piece ${index + 1} has an invalid color.`);
			}
			if (!GAME_SAVE_RANKS.has(piece.rank)) errors.push(`Piece ${index + 1} has an invalid rank.`);
			else if (piece.rank === 'king' && GAME_SAVE_COLORS.has(piece.color)) kings[piece.color]++;
			if (!isGameBoardPosition(piece.position)) errors.push(`Piece ${index + 1} has an invalid board position.`);
			else {
				if (positions.has(piece.position)) errors.push(`Board position ${piece.position} contains multiple pieces.`);
				positions.add(piece.position);
			}
			if (Object.hasOwn(piece, 'ableToCastle') && typeof piece.ableToCastle !== 'boolean') {
				errors.push(`Piece ${index + 1} has an invalid castling flag.`);
			}
		}
		if (kings.white !== 1 || kings.black !== 1) errors.push('A save must contain exactly one king of each color.');
	}

	if (state.enPassantTarget !== null && !isGameBoardPosition(state.enPassantTarget)) {
		errors.push('En-passant target must be null or a board position.');
	}
	if (state.enPassantPawn !== null && typeof state.enPassantPawn !== 'string') {
		errors.push('En-passant pawn must be null or a piece identity.');
	}
	if ((state.enPassantTarget === null) !== (state.enPassantPawn === null)) {
		errors.push('En-passant target and pawn must either both be present or both be null.');
	}
	if (state.enPassantPawn !== null && Array.isArray(state.pieces)) {
		const pawn = state.pieces.find(piece => isGameSaveObject(piece) && piece.name === state.enPassantPawn);
		if (!pawn || pawn.rank !== 'pawn') errors.push('En-passant pawn must identify a saved pawn.');
	}
	if (!Number.isInteger(state.halfmoveClock) || state.halfmoveClock < 0 || state.halfmoveClock > 99) {
		errors.push('Half-move clock must be an integer from 0 through 99.');
	}
	if (!Array.isArray(state.moveHistory) || state.moveHistory.length > 10000 ||
		state.moveHistory.some(move => typeof move !== 'string' || move.length === 0 || move.length > 64)) {
		errors.push('Move history must be an array of at most 10,000 short text entries.');
	}
	if (!Array.isArray(state.positionCounts) || state.positionCounts.length > 1000) {
		errors.push('Position counts must be an array of at most 1,000 entries.');
	}
	else {
		const seen = new Set();
		for (const [index, entry] of state.positionCounts.entries()) {
			if (!Array.isArray(entry) || entry.length !== 2 || !isGamePositionKey(entry[0]) ||
				!Number.isInteger(entry[1]) || entry[1] < 1 || entry[1] > 99) {
				errors.push(`Position count ${index + 1} is invalid.`);
				continue;
			}
			if (seen.has(entry[0])) errors.push(`Position count ${index + 1} duplicates a key.`);
			seen.add(entry[0]);
		}
	}
	if (state.lastMove !== null && (!Array.isArray(state.lastMove) ||
		!([2, 4].includes(state.lastMove.length)) || state.lastMove.some(position => !isGameBoardPosition(position)))) {
		errors.push('Last move must be null or contain two or four board positions.');
	}
	if (state.clock !== null) {
		const clock = state.clock;
		if (!isGameSaveObject(clock) ||
			!Number.isFinite(clock.whiteMilliseconds) || clock.whiteMilliseconds < 0 || clock.whiteMilliseconds > 86400000 ||
			!Number.isFinite(clock.blackMilliseconds) || clock.blackMilliseconds < 0 || clock.blackMilliseconds > 86400000 ||
			!Number.isFinite(clock.incrementMilliseconds) || clock.incrementMilliseconds < 0 || clock.incrementMilliseconds > 86400000 ||
			!GAME_SAVE_COLORS.has(clock.activeColor) || typeof clock.running !== 'boolean' ||
			(clock.flaggedColor !== null && !GAME_SAVE_COLORS.has(clock.flaggedColor)) ||
			(clock.running && clock.flaggedColor !== null)) {
			errors.push('Clock state is invalid.');
		}
	}
	return errors;
}

function createGameSaveSnapshot(game, savedAt = new Date().toISOString()) {
	if (!isGameSaveObject(game)) throw new TypeError('Game state must be an object.');
	if (game.gameOver || game.pendingPromotion || game.pendingHistoryMove || game.pendingCapture || game.pendingUndoEntry) {
		throw new Error('Only a stable, in-progress game can be saved.');
	}
	const clock = game.clock ? {
		whiteMilliseconds: game.clock.remainingMilliseconds.white,
		blackMilliseconds: game.clock.remainingMilliseconds.black,
		incrementMilliseconds: game.clock.incrementMilliseconds,
		activeColor: game.clock.activeColor,
		running: game.clock.running,
		flaggedColor: game.clock.flaggedColor ?? null,
	} : null;
	const save = {
		schema: GAME_SAVE_SCHEMA,
		version: GAME_SAVE_VERSION,
		savedAt,
		state: {
			turn: game.turn,
			pieces: Array.isArray(game.pieces) ? game.pieces.map(piece => {
				const savedPiece = {
					name: piece.name,
					rank: piece.rank,
					color: piece.color,
					position: Number(piece.position),
				};
				if (typeof piece.ableToCastle === 'boolean') savedPiece.ableToCastle = piece.ableToCastle;
				return savedPiece;
			}) : game.pieces,
			enPassantTarget: game.enPassantTarget ?? null,
			enPassantPawn: game.enPassantPawn ? game.enPassantPawn.name : null,
			halfmoveClock: game.halfmoveClock ?? 0,
			moveHistory: Array.isArray(game.moveHistory) ? [...game.moveHistory] : game.moveHistory,
			positionCounts: game.positionCounts && typeof game.positionCounts.entries === 'function'
				? Array.from(game.positionCounts.entries()) : game.positionCounts,
			lastMove: game.lastMove ? [...game.lastMove] : null,
			clock,
		},
	};
	const errors = validateGameSave(save);
	if (errors.length) throw new TypeError(`Cannot create game save: ${errors.join(' ')}`);
	return save;
}

function serializeGameSave(game, savedAt) {
	const serialized = JSON.stringify(createGameSaveSnapshot(game, savedAt));
	if (gameSaveByteLength(serialized) > MAX_GAME_SAVE_BYTES) throw new RangeError('Game save exceeds the maximum supported size.');
	return serialized;
}

function parseGameSave(serialized) {
	if (typeof serialized !== 'string' || serialized.length === 0 || gameSaveByteLength(serialized) > MAX_GAME_SAVE_BYTES) {
		throw new TypeError('Serialized game save must be a non-empty string no larger than 256 KB.');
	}
	let save;
	try {
		save = JSON.parse(serialized);
	}
	catch {
		throw new SyntaxError('Serialized game save is not valid JSON.');
	}
	const errors = validateGameSave(save);
	if (errors.length) throw new TypeError(`Invalid game save: ${errors.join(' ')}`);
	return save;
}
