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

function loadGameFromStorage(storage) {
	try {
		const target = getGameSaveStorage(storage);
		if (!target) return null;
		const serialized = target.getItem(GAME_SAVE_STORAGE_KEY);
		return serialized === null ? null : parseGameSave(serialized);
	}
	catch {
		return null;
	}
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
