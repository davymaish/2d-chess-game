const PGN_STANDARD_HEADERS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
const PGN_VALID_RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
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
