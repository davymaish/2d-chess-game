class ChessClock {
	constructor({ whiteSeconds = 300, blackSeconds = 300, activeColor = 'white', onTick = () => {}, onFlag = () => {}, now = () => Date.now(), setTimer = setInterval, clearTimer = clearInterval } = {}) {
		this.validateColor(activeColor);
		this.remainingMilliseconds = {
			white: this.secondsToMilliseconds(whiteSeconds),
				black: this.secondsToMilliseconds(blackSeconds),
		};
		this.activeColor = activeColor;
		this.onTick = onTick;
		this.onFlag = onFlag;
		this.now = now;
		this.setTimer = setTimer;
		this.clearTimer = clearTimer;
		this.timer = null;
		this.running = false;
		this.lastTickAt = null;
		this.flaggedColor = null;
	}

	validateColor(color) {
		if (color !== 'white' && color !== 'black') throw new RangeError(`Invalid chess clock color: ${color}`);
	}

	secondsToMilliseconds(seconds) {
		if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Clock time must be a finite nonnegative number of seconds.');
		return seconds * 1000;
	}

	getRemainingMilliseconds(color) {
		this.validateColor(color);
		return this.remainingMilliseconds[color];
	}

	getRemainingSeconds(color) {
		return Math.ceil(this.getRemainingMilliseconds(color) / 1000);
	}

	emitTick() {
		this.onTick({
			activeColor: this.activeColor,
			whiteSeconds: this.getRemainingSeconds('white'),
			blackSeconds: this.getRemainingSeconds('black'),
			running: this.running,
		});
	}

	start() {
		if (this.running || this.flaggedColor) return false;
		this.running = true;
		this.lastTickAt = this.now();
		this.timer = this.setTimer(() => this.tick(), 250);
		this.emitTick();
		return true;
	}

	resume() {
		return this.start();
	}

	pause() {
		if (!this.running) return false;
		this.tick();
		if (!this.running) return false;
		this.running = false;
		this.lastTickAt = null;
		this.clearTimer(this.timer);
		this.timer = null;
		this.emitTick();
		return true;
	}

	switchActiveSide(color = this.activeColor === 'white' ? 'black' : 'white') {
		this.validateColor(color);
		if (this.flaggedColor || color === this.activeColor) return false;
		if (this.running) {
			this.tick();
			if (this.flaggedColor) return false;
			this.lastTickAt = this.now();
		}
		this.activeColor = color;
		this.emitTick();
		return true;
	}

	tick() {
		if (!this.running || this.flaggedColor) return false;
		const currentTime = this.now();
		const elapsed = Math.max(0, currentTime - this.lastTickAt);
		this.lastTickAt = currentTime;
		this.remainingMilliseconds[this.activeColor] = Math.max(0, this.remainingMilliseconds[this.activeColor] - elapsed);
		if (this.remainingMilliseconds[this.activeColor] === 0) {
			this.flaggedColor = this.activeColor;
			this.running = false;
			this.clearTimer(this.timer);
			this.timer = null;
			this.lastTickAt = null;
			this.emitTick();
			this.onFlag({ flaggedColor: this.flaggedColor, winner: this.flaggedColor === 'white' ? 'black' : 'white' });
			return false;
		}
		this.emitTick();
		return true;
	}

	stop() {
		if (this.timer !== null) this.clearTimer(this.timer);
		this.timer = null;
		this.running = false;
		this.lastTickAt = null;
		this.emitTick();
	}
}
