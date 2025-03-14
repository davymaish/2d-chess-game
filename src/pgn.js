const PGN_STANDARD_HEADERS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
const PGN_VALID_RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
const PGN_SAN_TOKEN = /^(?:O-O(?:-O)?|[KQRBN](?:(?:[a-h][1-8]?)|[1-8])?x?[a-h][1-8]|(?:[a-h]x[a-h][1-8]|[a-h][1-8])(?:=[QRBN])?)(?:[+#])?$/;
const PGN_DEFAULT_HEADERS = {
	Event: 'Casual Game',
	Site: 'Local',
	Date: '????.??.??',
	Round: '-',
	White: 'White',
	Black: 'Black',
};

function parsePGNHistoryMove(notation, index) {
	if (typeof notation !== 'string') throw new TypeError(`PGN move ${index + 1} must be a numbered SAN string.`);
	const match = /^(\d+)\.(\.\.)?\s+([^\s]+)$/.exec(notation.trim());
	if (!match) throw new TypeError(`PGN move ${index + 1} must use numbered SAN notation.`);
	const number = Number(match[1]);
	if (!Number.isSafeInteger(number) || number < 1) throw new TypeError(`PGN move ${index + 1} has an invalid move number.`);
	if (!PGN_SAN_TOKEN.test(match[3])) throw new TypeError(`PGN move ${index + 1} contains an invalid SAN token.`);
	return { number, color: match[2] ? 'black' : 'white', san: match[3] };
}

function pgnMoveTokens(moveHistory) {
	const moves = moveHistory.map(parsePGNHistoryMove);
	const tokens = [];
	for (let index = 0; index < moves.length; index++) {
		const move = moves[index];
		const previous = moves[index - 1];
		if (previous) {
			const isNextBlack = previous.color === 'white' && move.color === 'black' && move.number === previous.number;
			const isNextWhite = previous.color === 'black' && move.color === 'white' && move.number === previous.number + 1;
			if (!isNextBlack && !isNextWhite) {
				throw new TypeError(`PGN move ${index + 1} does not follow the previous move number and color.`);
			}
		}
		if (move.color === 'white') tokens.push(`${move.number}.`, move.san);
		else {
			if (!previous || previous.color !== 'white' || previous.number !== move.number) tokens.push(`${move.number}...`);
			tokens.push(move.san);
		}
	}
	return tokens;
}

function wrapPGNMovetext(tokens, maxLineLength = 80) {
	const lines = [];
	let line = '';
	for (const token of tokens) {
		const nextLine = line ? `${line} ${token}` : token;
		if (line && nextLine.length > maxLineLength) {
			lines.push(line);
			line = token;
		}
		else line = nextLine;
	}
	if (line) lines.push(line);
	return lines.join('\n');
}

function escapePGNHeaderValue(value, tag) {
	if (typeof value !== 'string') throw new TypeError(`PGN header ${tag} must be a string.`);
	return value.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function serializeGameToPGN(game, headers = {}) {
	if (!game || typeof game !== 'object') throw new TypeError('PGN export requires a game object.');
	if (!Array.isArray(game.moveHistory)) throw new TypeError('PGN export requires a move history array.');
	if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new TypeError('PGN headers must be an object.');
	const result = game.resultToken ?? '*';
	if (!PGN_VALID_RESULTS.includes(result)) throw new TypeError('PGN result must be 1-0, 0-1, 1/2-1/2, or *.');

	const standardValues = { ...PGN_DEFAULT_HEADERS, ...headers, Result: result };
	const extraHeaders = Object.entries(headers).filter(([tag]) => !PGN_STANDARD_HEADERS.includes(tag));
	const outputHeaders = [
		...PGN_STANDARD_HEADERS.map(tag => [tag, standardValues[tag]]),
		...extraHeaders,
	];
	const tags = outputHeaders.map(([tag, value]) => {
		if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tag)) throw new TypeError(`Invalid PGN header name: ${tag}`);
		return `[${tag} "${escapePGNHeaderValue(value, tag)}"]`;
	});
	const tokens = pgnMoveTokens(game.moveHistory);
	tokens.push(result);
	return `${tags.join('\n')}\n\n${wrapPGNMovetext(tokens)}`;
}

function parseGamePGN(pgn) {
	if (typeof pgn !== 'string') throw new TypeError('PGN input must be a string.');
	const lines = pgn.replace(/^\uFEFF/, '').split(/\r?\n/);
	const headers = {};
	let lineIndex = 0;
	while (lineIndex < lines.length && lines[lineIndex].trim() === '') lineIndex++;
	while (lineIndex < lines.length && lines[lineIndex].trim().startsWith('[')) {
		const line = lines[lineIndex].trim();
		const match = /^\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"\\])*)"\]$/.exec(line);
		if (!match) throw new TypeError(`Invalid PGN tag pair on line ${lineIndex + 1}.`);
		const [, tag, rawValue] = match;
		if (Object.hasOwn(headers, tag)) throw new TypeError(`Duplicate PGN header: ${tag}.`);
		if (/\\(?!["\\])/.test(rawValue)) throw new TypeError(`Invalid escape in PGN header ${tag}.`);
		headers[tag] = rawValue.replace(/\\(["\\])/g, '$1');
		lineIndex++;
	}
	if (headers.Result !== undefined && !PGN_VALID_RESULTS.includes(headers.Result)) {
		throw new TypeError('PGN Result header must be 1-0, 0-1, 1/2-1/2, or *.');
	}

	const rawMovetext = lines.slice(lineIndex).join('\n');
	if (/[{};()$!?]/.test(rawMovetext)) throw new TypeError('PGN comments, variations, NAGs, and annotations are not supported by the basic parser.');
	const movetext = rawMovetext.replace(/(\d+\.(?:\.\.)?)(?=\S)/g, '$1 ').trim();
	const tokens = movetext ? movetext.split(/\s+/) : [];
	let expectedNumber = 1;
	let expectedColor = 'white';
	if (headers.FEN !== undefined) {
		const fenFields = headers.FEN.trim().split(/\s+/);
		if (fenFields.length !== 6 || !['w', 'b'].includes(fenFields[1]) || !/^[1-9]\d*$/.test(fenFields[5])) {
			throw new TypeError('PGN FEN header must contain a valid active color and fullmove number.');
		}
		expectedColor = fenFields[1] === 'b' ? 'black' : 'white';
		expectedNumber = Number(fenFields[5]);
		if (!Number.isSafeInteger(expectedNumber)) throw new TypeError('PGN FEN fullmove number is out of range.');
	}

	const moves = [];
	let moveMarker = null;
	let result = null;
	for (const token of tokens) {
		if (result) throw new TypeError('PGN movetext cannot contain tokens after the result marker.');
		const markerMatch = /^(\d+)\.(\.\.)?$/.exec(token);
		if (markerMatch) {
			if (moveMarker) throw new TypeError('PGN contains a move number without a SAN move.');
			const number = Number(markerMatch[1]);
			const color = markerMatch[2] ? 'black' : 'white';
			if (!Number.isSafeInteger(number) || number !== expectedNumber || color !== expectedColor) {
				throw new TypeError('PGN move number and color do not follow the previous move.');
			}
			moveMarker = { number, color };
			continue;
		}
		if (PGN_VALID_RESULTS.includes(token)) {
			result = token;
			continue;
		}
		if (!PGN_SAN_TOKEN.test(token)) throw new TypeError(`Invalid SAN token in PGN movetext: ${token}`);
		const move = moveMarker || { number: expectedNumber, color: expectedColor };
		if (move.number !== expectedNumber || move.color !== expectedColor) {
			throw new TypeError('PGN move number and color do not follow the previous move.');
		}
		moves.push(`${move.number}${move.color === 'black' ? '...' : '.'} ${token}`);
		moveMarker = null;
		if (expectedColor === 'white') expectedColor = 'black';
		else {
			expectedColor = 'white';
			expectedNumber++;
		}
	}
	if (moveMarker) throw new TypeError('PGN ends with a move number but no SAN move.');
	if (headers.Result !== undefined && result !== null && headers.Result !== result) {
		throw new TypeError('PGN Result header does not match the movetext result.');
	}
	return { headers, moves, result: result || headers.Result || '*' };
}
