class ReplayCursor {
	constructor(moveHistory) {
		if (!Array.isArray(moveHistory)) throw new TypeError('Replay cursor requires a move history array.');
		if (moveHistory.some(move => typeof move !== 'string')) throw new TypeError('Replay cursor moves must be strings.');
		this.moves = Object.freeze([...moveHistory]);
		this.index = -1;
	}

	getState() {
		return {
			index: this.index,
			totalMoves: this.moves.length,
			currentMove: this.index < 0 ? null : this.moves[this.index],
			atStart: this.index < 0,
			atEnd: this.index >= this.moves.length - 1,
		};
	}

	seek(index) {
		if (!Number.isInteger(index) || index < -1 || index >= this.moves.length) return false;
		this.index = index;
		return this.getState();
	}

	first() {
		return this.seek(-1);
	}

	previous() {
		if (this.index <= -1) return false;
		return this.seek(this.index - 1);
	}

	next() {
		if (this.index >= this.moves.length - 1) return false;
		return this.seek(this.index + 1);
	}

	last() {
		return this.moves.length ? this.seek(this.moves.length - 1) : this.getState();
	}
}
