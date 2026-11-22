const GAME_SAVE_STORAGE_KEY = '2d-chess-game:save:v1';

function getGameSaveStorage(storage) {
	if (storage) return storage;
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	}
	catch {
		return null;
	}
}

function saveGameToStorage(game, storage) {
	try {
		const target = getGameSaveStorage(storage);
		if (!target) return false;
		target.setItem(GAME_SAVE_STORAGE_KEY, serializeGameSave(game));
		return true;
	}
	catch {
		return false;
	}
}

function inspectGameSaveStorage(storage) {
	const target = getGameSaveStorage(storage);
	if (!target) return { status: 'unavailable', save: null };
	let serialized;
	try {
		serialized = target.getItem(GAME_SAVE_STORAGE_KEY);
	}
	catch {
		return { status: 'unavailable', save: null };
	}
	if (serialized === null) return { status: 'missing', save: null };
	if (typeof serialized !== 'string' || serialized.length > 256 * 1024) {
		clearGameSaveFromStorage(target);
		return { status: 'corrupt', save: null };
	}

	let candidate;
	try {
		candidate = JSON.parse(serialized);
	}
	catch {
		clearGameSaveFromStorage(target);
		return { status: 'corrupt', save: null };
	}
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
		clearGameSaveFromStorage(target);
		return { status: 'corrupt', save: null };
	}
	if (candidate.schema !== GAME_SAVE_SCHEMA || candidate.version !== GAME_SAVE_VERSION) {
		clearGameSaveFromStorage(target);
		return { status: 'outdated', save: null };
	}
	try {
		return { status: 'available', save: parseGameSave(serialized) };
	}
	catch {
		clearGameSaveFromStorage(target);
		return { status: 'corrupt', save: null };
	}
}

function loadGameFromStorage(storage) {
	return inspectGameSaveStorage(storage).save;
}

function clearGameSaveFromStorage(storage) {
	try {
		const target = getGameSaveStorage(storage);
		if (!target) return false;
		target.removeItem(GAME_SAVE_STORAGE_KEY);
		return true;
	}
	catch {
		return false;
	}
}
