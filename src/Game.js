console.log(
  "2D Chess Game Made by David Maina \nhttps://davymaish.github.io"
);

class Game {
	constructor(pieces) {
		this.board   = document.getElementById('board');
		this.squares = this.board.querySelectorAll('.square');
		this.pieces  = pieces;
		this.turn    = 'white';
		this.gameOver = false;
		this.enPassantTarget = null;
		this.enPassantPawn = null;
		this.promotionDialog = document.getElementById('promotion-dialog');
		this.pendingPromotion = null;
		this.promotionCounter = 0;
		this.moveList = document.getElementById('move-list');
		this.emptyMoveHistory = document.getElementById('move-history-empty');
		this.moveHistory = [];
		this.pendingHistoryMove = null;
		this.undoStack = [];
		this.redoStack = [];
		this.pendingUndoEntry = null;
		this.pendingCaptureState = null;
		this.lastMove = null;
		this.pendingCastleRookMove = null;
		this.clock = null;
		this.clockPreset = document.getElementById('clock-preset');
		this.clockStartButton = document.getElementById('clock-start');
		this.clockPauseButton = document.getElementById('clock-pause');
		this.clockStatus = document.getElementById('clock-status');
		this.whiteClockDisplay = document.getElementById('white-clock');
		this.blackClockDisplay = document.getElementById('black-clock');
		this.whiteClockSide = document.getElementById('white-clock-side');
		this.blackClockSide = document.getElementById('black-clock-side');
		this.moveSoundsToggle = document.getElementById('move-sounds');
		this.soundStatus = document.getElementById('sound-status');
		this.soundContext = null;
		this.halfmoveClock = 0;
		this.pendingCapture = false;
		this.isCastlingRookMove = false;
		this.positionCounts = new Map();
		this.recordPosition();
		this.turnSign = document.getElementById('turn');
		this.gameStatus = document.getElementById('game-status');
		this.selectionStatus = document.getElementById('selection-status');
		this.clickedPiece = null;
		this.allowedMoves = null;
		this.addEventListeners();
		this.addKeyboardControls();
		this.addHistoryControls();
		this.addGameControls();
		this.addClockControls();
		this.addSoundControls();
		this.whiteSematary = document.getElementById('whiteSematary');
		this.blackSematary = document.getElementById('blackSematary');
		this.updateBoardAccessibleNames();
		this.updateCheckStatus();
		const saveRead = inspectGameSaveStorage();
		this.addSavedGameControls(saveRead.save, saveRead.status);
	}

	addEventListeners() {
		this.pieces.forEach( piece => {
			piece.img.addEventListener("click", this.pieceMove.bind(this)); 
			piece.img.addEventListener("dragstart", this.pieceMove.bind(this)); 
			piece.img.addEventListener("drop", this.pieceMove.bind(this));
		});
		this.squares.forEach( square => {
			square.addEventListener("click", this.movePiece.bind(this)); 
			square.addEventListener("dragover", function(event){
				event.preventDefault();
			}); 
			square.addEventListener("drop", this.movePiece.bind(this)); 
		});
		this.promotionDialog.addEventListener('cancel', event => event.preventDefault());
		this.promotionDialog.querySelectorAll('[data-promotion]').forEach(button => {
			button.addEventListener('click', this.selectPromotion.bind(this));
		});
	}

	addKeyboardControls() {
		if (this.board) this.board.addEventListener('keydown', event => this.handleBoardKeydown(event));
	}

	focusBoardSquare(square) {
		if (!square) return false;
		this.squares.forEach(candidate => candidate.setAttribute('tabindex', candidate === square ? '0' : '-1'));
		square.focus();
		return true;
	}

	updateBoardAccessibleNames() {
		if (!this.squares || typeof this.squares.forEach !== 'function') return false;
		this.squares.forEach(square => {
			const position = parseInt(square.id);
			const coordinate = this.getSquareName(position);
			const piece = this.pieces.find(candidate => parseInt(candidate.position) === position);
			const description = piece ? `${piece.color} ${piece.rank}` : '';
			square.setAttribute('aria-label', `${coordinate}${description ? `, ${description}` : ''}`);
			if (piece && piece.img && typeof piece.img.setAttribute === 'function') piece.img.setAttribute('alt', description);
		});
		return true;
	}

	handleBoardKeydown(event) {
		if (this.gameOver || !event || !event.target) return false;
		const square = typeof event.target.closest === 'function' ? event.target.closest('.square') : event.target;
		if (!square || !square.id) return false;
		const rank = Number(square.dataset.rank || Math.floor(Number(square.id) / 10));
		const file = Number(square.dataset.file ? square.dataset.file.charCodeAt(0) - 96 : Number(square.id) % 10);
		const directions = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [1, 0], ArrowDown: [-1, 0] };
		if (directions[event.key]) {
			let [rankStep, fileStep] = directions[event.key];
			if (this.board.dataset && this.board.dataset.orientation === 'black') { rankStep *= -1; fileStep *= -1; }
			const nextRank = rank + rankStep;
			const nextFile = file + fileStep;
			const destination = Array.from(this.squares).find(candidate => Number(candidate.id) === nextRank * 10 + nextFile);
			if (destination) this.focusBoardSquare(destination);
			event.preventDefault();
			return true;
		}
		if (event.key === 'Escape') {
			this.setClickedPiece(null);
			this.allowedMoves = null;
			this.clearSquares();
			event.preventDefault();
			return true;
		}
		if (event.key !== 'Enter' && event.key !== ' ') return false;
		event.preventDefault();
		const position = Number(square.id);
		if (this.clickedPiece && this.allowedMoves && this.allowedMoves.includes(position)) return this.movePiece(null, square);
		const piece = this.getPieceByPos(position);
		if (piece && piece.color === this.turn) return this.pieceMove({ target: piece.img, type: 'keyboard' });
		return false;
	}

	pieceMove(event) {
		if (this.gameOver) {
			this.clearSquares();
			return false;
		}
		const name = event.target.getAttribute('id');
		if (event.type === 'click' && this.clickedPiece && this.clickedPiece.name === name) {
			this.setClickedPiece(null);
			return this.clearSquares();
		}
		const allowedMoves = this.getPieceAllowedMoves(event, name);
		if (allowedMoves) {
			const piece = this.getPieceByName(name);
			const position = piece.position;
			const clickedSquare = document.getElementById(position);
			clickedSquare.classList.add('selected-square');

			allowedMoves.forEach( allowedMove => {
				if (document.body.contains(document.getElementById(allowedMove))) {
					const destination = document.getElementById(allowedMove);
					destination.classList.add('allowed');
					destination.classList.add(`allowed-${this.getMoveKind(piece, allowedMove)}`);
				}	
			});
			this.announceSelection(piece, allowedMoves);
		}
		else{
			this.clearSquares();
		}
	}

	getSquareName(position) {
		const square = parseInt(position);
		return `${String.fromCharCode(96 + square % 10)}${Math.floor(square / 10)}`;
	}

	getMoveKind(piece, position) {
		const target = parseInt(position);
		if (piece.rank === 'king' && Math.abs(target - parseInt(piece.position)) === 2) return 'castling';
		if (this.getEnPassantCapture(target)) return 'en-passant';
		if (this.getPieceByPos(target)) return 'capture';
		return 'quiet';
	}

	getMoveKindLabel(kind) {
		return {
			quiet: 'quiet move',
			capture: 'capture',
			'en-passant': 'en passant capture',
			castling: 'castling',
		}[kind] || 'legal move';
	}

	announceSelection(piece, allowedMoves) {
		if (!this.selectionStatus) return;
		const destinations = allowedMoves.map(position => {
			const kind = this.getMoveKind(piece, position);
			return `${this.getSquareName(position)} (${this.getMoveKindLabel(kind)})`;
		});
		const destinationMessage = destinations.length
			? `Legal destinations (${destinations.length}): ${destinations.join(', ')}.`
			: 'No legal destinations.';
		this.selectionStatus.textContent = `${piece.color} ${piece.rank} selected on ${this.getSquareName(piece.position)}. ${destinationMessage}`;
	}

	changeTurn() {
		if (this.turn == 'white') {
			this.turn = 'black';
			this.turnSign.innerHTML = "Black's Turn";
		}
		else{
			this.turn = 'white';
			this.turnSign.innerHTML = "White's Turn";
		}
	}

	updateCheckStatus(isInCheck) {
		this.board.querySelectorAll('.in-check').forEach(square => square.classList.remove('in-check'));
		const checked = typeof isInCheck === 'boolean' ? isInCheck : this.king_checked(this.turn);
		const colorName = this.turn.charAt(0).toUpperCase() + this.turn.slice(1);

		if (checked) {
			const king = this.getPieceByName(this.turn + 'King');
			this.squares.forEach(square => {
				if (String(square.id) === String(king.position)) square.classList.add('in-check');
			});
			this.gameStatus.textContent = colorName + ' is in check.';
			this.gameStatus.classList.add('is-check');
		}
		else {
			this.gameStatus.textContent = colorName + ' to move.';
			this.gameStatus.classList.remove('is-check');
		}
	}

	getPiecesByColor(color) {
		return this.pieces.filter(obj => {
		  return obj.color === color
		});
	}

	getPlayerPositions(color){
		const pieces = this.getPiecesByColor(color);
		return pieces.map( a => parseInt(a.position));
	}

	filterPositions(positions) {
		return positions.filter(pos => {
			const rank = Math.floor(pos / 10);
				const file = pos % 10;
				return rank >= 1 && rank <= 8 && file >= 1 && file <= 8;
			});
		};

	getEnPassantCapture(targetPosition) {
		const movingPawn = this.clickedPiece;
		const capturedPawn = this.enPassantPawn;
		const target = parseInt(targetPosition);
		if (!movingPawn || !movingPawn.hasRank('pawn') || !capturedPawn ||
			!capturedPawn.hasRank('pawn') || capturedPawn.color === movingPawn.color ||
			target !== this.enPassantTarget || this.getPieceByPos(target)) return null;

		const movingRank = Math.floor(movingPawn.position / 10);
		const capturedRank = Math.floor(capturedPawn.position / 10);
		if (movingRank !== capturedRank ||
			Math.abs(movingPawn.position % 10 - capturedPawn.position % 10) !== 1 ||
			target % 10 !== capturedPawn.position % 10) return null;

		const expectedTarget = capturedPawn.position + (movingPawn.color === 'white' ? 10 : -10);
		return target === expectedTarget ? capturedPawn : null;
	}

	unblockedPositions(allowedPositions=[], position, color, checking=true){
		position = parseInt(position);
		const unblockedPositions = [];

		if (color == 'white') {
			var myBlockedPositions    = this.getPlayerPositions('white');
			var otherBlockedPositions = this.getPlayerPositions('black');
		}
		else{
			var myBlockedPositions    = this.getPlayerPositions('black');
			var otherBlockedPositions = this.getPlayerPositions('white');
		}
		
		if (this.clickedPiece.hasRank('pawn')) {
			for (const move of allowedPositions[0]) { //attacking moves
				const enPassantCapture = this.getEnPassantCapture(move);
				if (checking && this.myKingChecked(move, true, enPassantCapture)) continue;
				if (otherBlockedPositions.indexOf(move) != -1 || enPassantCapture) unblockedPositions.push(move);
			}
			const blockedPositions = myBlockedPositions + otherBlockedPositions;
			for (const move of allowedPositions[1]) { //moving moves
				if (blockedPositions.indexOf(move) != -1) break;
				else if (checking && this.myKingChecked(move, false)) continue;
				unblockedPositions.push(move);
			}
		}
		else{
			allowedPositions.forEach( allowedPositionsGroup => {
				for (const move of allowedPositionsGroup) {
					if (myBlockedPositions.indexOf(move) != -1) {
						break;
					}
					else if ( checking && this.myKingChecked(move) ) {
						continue;
					}
					unblockedPositions.push(move);
					if (otherBlockedPositions.indexOf(move) != -1) break;
				}
			});
		}
			
		return this.filterPositions(unblockedPositions);
	}

	getPieceAllowedMoves(event, pieceName){
		if (this.gameOver) return 0;
		const piece = this.getPieceByName(pieceName);
		if(this.turn == piece.color){
			this.clearSquares();
			this.setClickedPiece(piece);
			if (event.type == 'dragstart') {
				event.dataTransfer.setData("text", event.target.id);
			}

			let pieceAllowedMoves = piece.getAllowedMoves();
			if (piece.rank == 'king') {
				pieceAllowedMoves = this.getCastlingSquares(pieceAllowedMoves);
			}

			const allowedMoves = this.unblockedPositions( pieceAllowedMoves, piece.position, piece.color, true );
			this.allowedMoves = allowedMoves;
			return allowedMoves;
		}
		else if (this.clickedPiece && this.turn == this.clickedPiece.color && this.allowedMoves && this.allowedMoves.indexOf(piece.position) != -1) {
			this.kill(piece);
		}
		else{
			return 0;
		}
	}

	getCastlingSquares(allowedMoves) {
		if ( !this.clickedPiece.ableToCastle || this.king_checked(this.turn) ) return allowedMoves;
		const rook1 = this.getPieceByName(this.turn+'Rook1');
		const rook2 = this.getPieceByName(this.turn+'Rook2');
		if (rook1 && rook1.ableToCastle) {
			const castlingPosition = rook1.position + 2
            if(
                !this.positionHasExistingPiece(castlingPosition - 1) &&
                !this.positionHasExistingPiece(castlingPosition) && !this.myKingChecked(castlingPosition, true) &&
                !this.positionHasExistingPiece(castlingPosition + 1) && !this.myKingChecked(castlingPosition + 1, true)
            )
			allowedMoves[1].push(castlingPosition);
		}
		if (rook2 && rook2.ableToCastle) {
			const castlingPosition = rook2.position - 1;
			if(
                !this.positionHasExistingPiece(castlingPosition - 1) && !this.myKingChecked(castlingPosition - 1, true) &&
                !this.positionHasExistingPiece(castlingPosition) && !this.myKingChecked(castlingPosition, true)
            )
			allowedMoves[0].push(castlingPosition);
		}
		return allowedMoves;
	}

	getPieceByName(piecename) {
		return this.pieces.filter( obj => obj.name === piecename )[0];
	}

	getPieceByPos(piecePosition) {
		return this.pieces.filter(obj =>  obj.position === piecePosition )[0];
	}

	positionHasExistingPiece(position) {
		return this.getPieceByPos(position) != undefined;
	}

	setClickedPiece(piece) {
		this.clickedPiece = piece;
	}

	recordEnPassantOpportunity(piece, fromPosition, toPosition) {
		this.enPassantTarget = null;
		this.enPassantPawn = null;
		if (!piece.hasRank('pawn')) return;

		const from = parseInt(fromPosition);
		const to = parseInt(toPosition);
		const startingRank = piece.color === 'white' ? 2 : 7;
		const doubleStep = piece.color === 'white' ? 20 : -20;
		if (Math.floor(from / 10) !== startingRank || to - from !== doubleStep) return;

		this.enPassantTarget = from + doubleStep / 2;
		this.enPassantPawn = piece;
	}

	movePiece(event, square='') {
		if (this.gameOver) {
			if (event) event.preventDefault();
			return false;
		}
		square = square || event.target;
		if (square.classList.contains('allowed')) {
			const clickedPiece = this.clickedPiece;
			if (!clickedPiece) return 0;

			const newPosition = square.getAttribute('id');
			const originalPosition = parseInt(clickedPiece.position);
				const disambiguation = this.getMoveDisambiguation(clickedPiece, newPosition);
				const enPassantCapture = this.getEnPassantCapture(newPosition);
				if (enPassantCapture) this.capturePiece(enPassantCapture);
				const isCapture = Boolean(this.pendingCapture || enPassantCapture);
				if (!this.isCastlingRookMove) {
					this.pendingUndoEntry = {
						before: this.pendingCaptureState || this.captureMoveState(),
						piece: clickedPiece,
						from: originalPosition,
						to: parseInt(newPosition),
						supported: true,
					};
					this.pendingCaptureState = null;
				}
			if (clickedPiece.hasRank('king') || clickedPiece.hasRank('pawn'))
				clickedPiece.changePosition(newPosition, true);
			else
				clickedPiece.changePosition(newPosition);
			if (!this.isCastlingRookMove) {
				this.pendingHistoryMove = {
					color: clickedPiece.color,
					rank: clickedPiece.rank,
					from: originalPosition,
					to: parseInt(newPosition),
					isCapture,
					promotion: null,
					disambiguation,
				};
				this.recordHalfmove(clickedPiece, isCapture);
				this.pendingCapture = false;
			}
			this.recordEnPassantOpportunity(clickedPiece, originalPosition, newPosition);
				square.append(clickedPiece.img);
				if (!this.isCastlingRookMove) {
					const moveSquares = [{ from: originalPosition, to: parseInt(newPosition) }];
					if (this.pendingCastleRookMove) moveSquares.push(this.pendingCastleRookMove);
					this.pendingCastleRookMove = null;
					this.setLastMoveHighlight(moveSquares);
				}
				this.clearSquares();
			if (!this.pendingPromotion) this.finishMove(clickedPiece.color);
		}
		if (event) event.preventDefault();
	}

	addClockControls() {
		if (this.clockStartButton) this.clockStartButton.addEventListener('click', () => this.startClockFromPreset());
		if (this.clockPauseButton) this.clockPauseButton.addEventListener('click', () => this.pauseClock());
		this.updateClockControls();
	}

	addSoundControls() {
		if (!this.moveSoundsToggle) return;
		try {
			this.moveSoundsToggle.checked = typeof localStorage !== 'undefined' && localStorage.getItem('chess-move-sounds') === 'on';
		}
		catch (error) {
			this.moveSoundsToggle.checked = false;
		}
		this.updateSoundStatus();
		this.moveSoundsToggle.addEventListener('change', () => {
			try {
				if (typeof localStorage !== 'undefined') localStorage.setItem('chess-move-sounds', this.moveSoundsToggle.checked ? 'on' : 'off');
			}
			catch (error) { /* Keep the in-page preference usable if storage is unavailable. */ }
			this.updateSoundStatus();
		});
	}

	updateSoundStatus() {
		if (this.soundStatus) this.soundStatus.textContent = this.moveSoundsToggle && this.moveSoundsToggle.checked ? 'Move sounds are on.' : 'Move sounds are off.';
	}

	playMoveSound(isCapture = false) {
		return this.playSoundTone(isCapture ? 300 : 620, 0.09);
	}

	playStatusSound(kind) {
		const cues = { check: [820, 0.12], 'game-end': [440, 0.18] };
		const cue = cues[kind];
		if (!cue) return false;
		return this.playSoundTone(cue[0], cue[1], 0.1);
	}

	playSoundTone(frequency, duration, delay = 0) {
		if (!this.moveSoundsToggle || !this.moveSoundsToggle.checked || typeof window === 'undefined') return false;
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) return false;
		try {
			if (!this.soundContext) this.soundContext = new AudioContextClass();
			const oscillator = this.soundContext.createOscillator();
			const gain = this.soundContext.createGain();
			const startAt = this.soundContext.currentTime + delay;
			oscillator.type = 'sine';
			oscillator.frequency.value = frequency;
			gain.gain.setValueAtTime(0.035, startAt);
			gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
			oscillator.connect(gain);
			gain.connect(this.soundContext.destination);
			oscillator.start(startAt);
			oscillator.stop(startAt + duration);
			return true;
		}
		catch (error) {
			return false;
		}
	}

	formatClockTime(seconds) {
		const wholeSeconds = Math.max(0, Math.floor(seconds));
		return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
	}

	updateClockDisplay(state) {
		if (this.whiteClockDisplay) this.whiteClockDisplay.textContent = this.formatClockTime(state.whiteSeconds);
		if (this.blackClockDisplay) this.blackClockDisplay.textContent = this.formatClockTime(state.blackSeconds);
		if (this.whiteClockSide) this.whiteClockSide.setAttribute('aria-current', String(state.activeColor === 'white'));
		if (this.blackClockSide) this.blackClockSide.setAttribute('aria-current', String(state.activeColor === 'black'));
	}

	updateClockControls() {
		const running = Boolean(this.clock && this.clock.running);
		const finished = Boolean(this.clock && this.clock.flaggedColor);
		if (this.clockPreset) this.clockPreset.disabled = Boolean(this.clock) || finished || this.gameOver;
		if (this.clockStartButton) {
			this.clockStartButton.textContent = this.clock ? 'Resume clock' : 'Start clock';
			this.clockStartButton.disabled = running || finished || this.gameOver;
		}
		if (this.clockPauseButton) this.clockPauseButton.disabled = !running || this.gameOver;
	}

	startClockFromPreset() {
		if (this.gameOver) return false;
		if (this.clock) {
			if (this.clock.flaggedColor) return false;
			const resumed = this.clock.resume();
			if (resumed && this.clockStatus) this.clockStatus.textContent = 'Clock resumed.';
			this.updateClockControls();
			return resumed;
		}
		const preset = this.clockPreset && getChessClockPreset(this.clockPreset.value);
		if (!preset) return false;
		const clock = new ChessClock({
			whiteSeconds: preset.baseSeconds,
			blackSeconds: preset.baseSeconds,
			incrementSeconds: preset.incrementSeconds,
			activeColor: this.turn,
			onTick: state => this.updateClockDisplay(state),
		});
		const started = this.attachClock(clock);
		if (started && this.clockStatus) this.clockStatus.textContent = `${preset.label} clock started.`;
		this.updateClockControls();
		return started;
	}

	pauseClock() {
		if (!this.clock || !this.clock.pause()) return false;
		if (this.clockStatus) this.clockStatus.textContent = 'Clock paused.';
		this.updateClockControls();
		return true;
	}

	attachClock(clock) {
		if (!clock || clock.activeColor !== this.turn || typeof clock.start !== 'function' || typeof clock.switchActiveSide !== 'function') return false;
		this.clock = clock;
		const previousOnFlag = typeof clock.onFlag === 'function' ? clock.onFlag : () => {};
		clock.onFlag = result => {
			try { previousOnFlag(result); }
			finally { this.handleTimeout(result.flaggedColor); }
		};
		return clock.running ? true : clock.start();
	}

	finishMove(movingColor) {
		if (this.gameOver) return false;
		this.changeTurn();
		if (!this.isCastlingRookMove && this.clock) this.clock.switchActiveSide(this.turn);
		if (!this.isCastlingRookMove) this.recordPosition();
		this.updateBoardAccessibleNames();
		const outcome = this.getGameOutcome(this.turn);
		if (outcome === 'check') this.playStatusSound('check');
		if (!this.isCastlingRookMove && this.pendingHistoryMove) {
			this.pendingHistoryMove.checkSuffix = outcome === 'checkmate' ? '#' : outcome === 'check' ? '+' : '';
			this.recordMoveHistory(this.pendingHistoryMove);
			this.playMoveSound(this.pendingHistoryMove.isCapture);
			this.pendingHistoryMove = null;
		}
		if (!this.isCastlingRookMove) this.commitPendingUndoMove();
		this.updateCheckStatus(outcome === 'check' || outcome === 'checkmate');
		if (outcome === 'checkmate') this.checkmate(movingColor);
		else if (outcome === 'stalemate') this.stalemate();
		else if (outcome === 'insufficient-material') this.drawByInsufficientMaterial();
		else if (outcome === 'fifty-move-draw') this.drawByFiftyMoveRule();
		else if (outcome === 'threefold-repetition') this.drawByThreefoldRepetition();
		if (!this.isCastlingRookMove) {
			if (this.gameOver) clearGameSaveFromStorage();
			else this.persistCurrentGame();
		}
	}

	formatMove(move) {
		const squareName = position => `${String.fromCharCode(96 + position % 10)}${Math.floor(position / 10)}`;
		const from = parseInt(move.from);
		const to = parseInt(move.to);
		let notation;
		if (move.rank === 'king' && Math.abs(to - from) === 2) {
			notation = to > from ? 'O-O' : 'O-O-O';
		}
		else {
			const pieceLetter = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N' }[move.rank] || '';
			const origin = move.rank === 'pawn'
				? (move.isCapture ? String.fromCharCode(96 + from % 10) : '')
				: (move.disambiguation || '');
			const separator = move.isCapture ? 'x' : '';
			const promotion = move.promotion ? `=${move.promotion.charAt(0).toUpperCase()}` : '';
			notation = `${pieceLetter}${origin}${separator}${squareName(to)}${promotion}`;
		}
		return `${notation}${move.checkSuffix || ''}`;
	}
	getMoveDisambiguation(movingPiece, targetPosition) {
		if (movingPiece.rank === 'pawn' || movingPiece.rank === 'king') return '';
		const target = parseInt(targetPosition);
		const previousPiece = this.clickedPiece;
		const alternatives = [];
		try {
			for (const candidate of this.pieces) {
				if (candidate === movingPiece || candidate.color !== movingPiece.color || candidate.rank !== movingPiece.rank) continue;
				this.setClickedPiece(candidate);
				const legalMoves = this.unblockedPositions(
					candidate.getAllowedMoves(), candidate.position, candidate.color, true
				);
				if (legalMoves.includes(target)) alternatives.push(candidate);
			}
		}
		finally {
			this.setClickedPiece(previousPiece);
		}
		if (alternatives.length === 0) return '';
		const file = String.fromCharCode(96 + parseInt(movingPiece.position) % 10);
		const rank = String(Math.floor(parseInt(movingPiece.position) / 10));
		const competitors = [movingPiece, ...alternatives];
		const sharesFile = competitors.some(piece => piece !== movingPiece && parseInt(piece.position) % 10 === parseInt(movingPiece.position) % 10);
		const sharesRank = competitors.some(piece => piece !== movingPiece && Math.floor(parseInt(piece.position) / 10) === Math.floor(parseInt(movingPiece.position) / 10));
		if (!sharesFile) return file;
		if (!sharesRank) return rank;
		return `${file}${rank}`;
	}

	recordMoveHistory(move) {
		if (!Array.isArray(this.moveHistory)) this.moveHistory = [];
		const moveNumber = Math.floor(this.moveHistory.length / 2) + 1;
		const turnLabel = move.color === 'black' ? `${moveNumber}...` : `${moveNumber}.`;
		const notation = `${turnLabel} ${this.formatMove(move)}`;
		this.moveHistory.push(notation);
		if (!this.moveList) return;
		const item = document.createElement('div');
		item.textContent = notation;
		this.moveList.appendChild(item);
		this.moveList.scrollTop = this.moveList.scrollHeight;
		if (this.emptyMoveHistory) this.emptyMoveHistory.hidden = true;
	}

	recordHalfmove(piece, isCapture) {
		if (piece.hasRank('pawn') || isCapture) this.halfmoveClock = 0;
		else this.halfmoveClock = (this.halfmoveClock || 0) + 1;
	}

	capturePiece(piece) {
		if (!this.isCastlingRookMove && !this.pendingCaptureState) this.pendingCaptureState = this.captureMoveState();
		this.pendingCapture = true;
		piece.img.parentNode.removeChild(piece.img);
		piece.img.className = '';

		if (piece.color == 'white') this.whiteSematary.querySelector('.'+piece.rank).append(piece.img);
		else this.blackSematary.querySelector('.'+piece.rank).append(piece.img);

		this.pieces.splice(this.pieces.indexOf(piece), 1);
	}

	kill(piece) {
		this.capturePiece(piece);
		const chosenSquare = document.getElementById(piece.position);
		this.movePiece('', chosenSquare);
	}

	castleRook(rookName) {
		const rook = this.getPieceByName(rookName);
		const newPosition = rookName.indexOf('Rook2') != -1 ? rook.position - 2 : rook.position + 3;
		this.pendingCastleRookMove = { from: parseInt(rook.position), to: parseInt(newPosition) };

		this.setClickedPiece(rook);
		const chosenSquare = document.getElementById(newPosition);
		chosenSquare.classList.add('allowed');

		this.isCastlingRookMove = true;
		try {
			this.movePiece('', chosenSquare );
		}
		finally {
			this.isCastlingRookMove = false;
		}
		this.changeTurn();
	}

	beginPromotion(pawn) {
		this.pendingPromotion = pawn;
		this.promotionDialog.showModal();
		this.promotionDialog.querySelector('[data-promotion]').focus();
	}

	selectPromotion(event) {
		this.promote(this.pendingPromotion, event.currentTarget.getAttribute('data-promotion'));
	}

	promote(pawn, choice) {
		const pieceClasses = { queen: Queen, rook: Rook, bishop: Bishop, knight: Knight };
		const PromotedPiece = pieceClasses[choice];
		if (!pawn || pawn !== this.pendingPromotion || !PromotedPiece) return null;

		const capitalizedChoice = choice.charAt(0).toUpperCase() + choice.slice(1);
		const promotedName = `${pawn.color}${capitalizedChoice}Promoted${++this.promotionCounter}`;
		const image = pawn.img;
		image.id = promotedName;
		image.className = `piece ${choice}`;
		image.src = image.src.replace(/Pawn\.png$/, `${capitalizedChoice}.png`);

		this.pieces.splice(this.pieces.indexOf(pawn), 1);
		const promotedPiece = new PromotedPiece(pawn.position, promotedName);
		promotedPiece.img = image;
				this.pieces.push(promotedPiece);
				this.pendingPromotion = null;
				if (this.pendingHistoryMove) this.pendingHistoryMove.promotion = choice;
				this.promotionDialog.close();
		this.finishMove(pawn.color);
		return promotedPiece;
	}

	captureMoveState() {
		return {
			pieces: this.pieces.map(piece => ({
				piece,
				position: parseInt(piece.position),
				ableToCastle: piece.ableToCastle,
				imgClassName: piece.img && piece.img.className,
				imgId: piece.img && piece.img.id,
				imgSrc: piece.img && piece.img.src,
			})),
			turn: this.turn,
			halfmoveClock: this.halfmoveClock || 0,
			enPassantTarget: this.enPassantTarget ?? null,
			enPassantPawn: this.enPassantPawn || null,
			positionCounts: new Map(this.positionCounts || []),
			moveHistory: [...(this.moveHistory || [])],
			lastMove: this.lastMove ? [...this.lastMove] : null,
		};
	}

	commitPendingUndoMove() {
		if (!this.pendingUndoEntry) return;
		if (!Array.isArray(this.undoStack)) this.undoStack = [];
		if (!Array.isArray(this.redoStack)) this.redoStack = [];
		this.pendingUndoEntry.after = this.captureMoveState();
		this.undoStack.push(this.pendingUndoEntry);
		this.redoStack.length = 0;
		this.pendingUndoEntry = null;
		this.updateHistoryControls();
	}

	undoMove() {
		if (this.gameOver) return false;
		if (!Array.isArray(this.undoStack) || this.undoStack.length === 0) return false;
		const entry = this.undoStack[this.undoStack.length - 1];
		if (!entry.supported) return false;
		this.undoStack.pop();
		this.redoStack.push(entry);
		this.restoreMoveState(entry.before, entry);
		return true;
	}

	redoMove() {
		if (this.gameOver) return false;
		if (!Array.isArray(this.redoStack) || this.redoStack.length === 0) return false;
		const entry = this.redoStack.pop();
		this.undoStack.push(entry);
		this.restoreMoveState(entry.after, entry);
		return true;
	}

	restoreMoveState(state, entry = null) {
		this.pieces = state.pieces.map(pieceState => pieceState.piece);
		const activePieces = new Map(state.pieces.map(pieceState => [pieceState.piece, pieceState]));
		const activeImages = new Set(this.pieces.map(piece => piece.img).filter(Boolean));
		const knownPieces = new Set([
			...this.pieces,
			...(entry ? entry.before.pieces.map(pieceState => pieceState.piece) : []),
			...(entry && entry.after ? entry.after.pieces.map(pieceState => pieceState.piece) : []),
		]);
		knownPieces.forEach(piece => {
			const pieceState = activePieces.get(piece);
			if (!pieceState) {
				if (piece.img && activeImages.has(piece.img)) return;
				const cemetery = piece.color === 'white' ? this.whiteSematary : this.blackSematary;
				const grave = cemetery && cemetery.querySelector('.' + piece.rank);
				if (grave && piece.img) {
					piece.img.className = '';
					grave.append(piece.img);
				}
				return;
			}
			piece.position = pieceState.position;
			if (pieceState.ableToCastle !== undefined) piece.ableToCastle = pieceState.ableToCastle;
			if (piece.img && pieceState.imgClassName !== undefined) piece.img.className = pieceState.imgClassName;
			if (piece.img && pieceState.imgId !== undefined) piece.img.id = pieceState.imgId;
			if (piece.img && pieceState.imgSrc !== undefined) piece.img.src = pieceState.imgSrc;
			const square = document.getElementById(pieceState.position);
			if (square && typeof square.append === 'function' && piece.img) square.append(piece.img);
		});
		this.turn = state.turn;
		this.halfmoveClock = state.halfmoveClock;
		this.enPassantTarget = state.enPassantTarget;
		this.enPassantPawn = state.enPassantPawn;
		this.positionCounts = new Map(state.positionCounts);
		this.moveHistory = [...state.moveHistory];
			this.lastMove = state.lastMove ? [...state.lastMove] : null;
			if (this.turnSign) this.turnSign.innerHTML = this.turn === 'white' ? "White's Turn" : "Black's Turn";
			this.updateBoardAccessibleNames();
			this.renderMoveHistory();
		this.updateHistoryControls();
		if (typeof this.clearSquares === 'function') this.clearSquares();
		if (this.lastMove && this.lastMove.length >= 2) {
			const moves = [];
			for (let index = 0; index < this.lastMove.length; index += 2) moves.push({ from: this.lastMove[index], to: this.lastMove[index + 1] });
			this.setLastMoveHighlight(moves);
		}
		else {
			const board = this.board || document.getElementById('board');
			if (board && typeof board.querySelectorAll === 'function') board.querySelectorAll('.last-move').forEach(square => {
				if (square.classList && typeof square.classList.remove === 'function') square.classList.remove('last-move');
			});
			}
			this.refreshOutcomeDisplay();
			if (this.gameOver) clearGameSaveFromStorage();
			else this.persistCurrentGame();
		}

	renderMoveHistory() {
		if (this.moveList) {
			this.moveList.textContent = '';
			this.moveHistory.forEach(notation => {
				const item = document.createElement('div');
				item.textContent = notation;
				this.moveList.appendChild(item);
			});
			this.moveList.scrollTop = this.moveList.scrollHeight;
		}
		if (this.emptyMoveHistory) this.emptyMoveHistory.hidden = this.moveHistory.length > 0;
	}

	refreshOutcomeDisplay() {
		if (typeof this.getGameOutcome !== 'function' || typeof this.updateCheckStatus !== 'function') return;
		const outcome = this.getGameOutcome(this.turn);
		this.updateCheckStatus(outcome === 'check' || outcome === 'checkmate');
		const endScene = document.getElementById('endscene');
		if (endScene && endScene.classList) endScene.classList.remove('show');
		if (outcome === 'checkmate') this.checkmate(this.turn === 'white' ? 'black' : 'white');
		else if (outcome === 'stalemate') this.stalemate();
		else if (outcome === 'insufficient-material') this.drawByInsufficientMaterial();
		else if (outcome === 'fifty-move-draw') this.drawByFiftyMoveRule();
		else if (outcome === 'threefold-repetition') this.drawByThreefoldRepetition();
	}

	addHistoryControls() {
		this.undoButton = document.getElementById('undo-move');
		this.redoButton = document.getElementById('redo-move');
		if (this.undoButton) this.undoButton.addEventListener('click', () => this.undoMove());
		if (this.redoButton) this.redoButton.addEventListener('click', () => this.redoMove());
		if (document.addEventListener) document.addEventListener('keydown', event => {
			if (this.pendingPromotion || (!event.ctrlKey && !event.metaKey) || event.altKey) return;
			const key = event.key.toLowerCase();
			if (key === 'z') {
				event.preventDefault();
				if (event.shiftKey) this.redoMove();
				else this.undoMove();
			}
			else if (key === 'y' && !event.shiftKey) {
				event.preventDefault();
				this.redoMove();
			}
		});
		this.updateHistoryControls();
	}

	updateHistoryControls() {
		if (this.undoButton) this.undoButton.disabled = this.gameOver || !this.undoStack || this.undoStack.length === 0;
		if (this.redoButton) this.redoButton.disabled = this.gameOver || !this.redoStack || this.redoStack.length === 0;
	}

	addGameControls() {
		this.newGameButton = document.getElementById('new-game');
		if (this.newGameButton) this.newGameButton.addEventListener('click', () => this.startNewGame());
		this.resignButton = document.getElementById('resign-game');
		if (this.resignButton) this.resignButton.addEventListener('click', () => this.requestResignation());
		this.restartButton = document.getElementById('restart-game');
		if (this.restartButton) this.restartButton.addEventListener('click', () => this.startNewGame());
	}

	addSavedGameControls(savedGame, storageStatus = 'missing') {
		this.savedGameDialog = document.getElementById('saved-game-dialog');
		this.resumeSavedGameButton = document.getElementById('resume-saved-game');
		this.startNewFromSaveButton = document.getElementById('start-new-from-save');
		this.clearSavedGameButton = document.getElementById('clear-saved-game');
		this.saveStatus = document.getElementById('save-status');
		const recoveryMessages = {
			corrupt: 'An unreadable saved game was discarded. Your new game can continue normally.',
			outdated: 'A saved game from an unsupported format was discarded. Your new game can continue normally.',
			unavailable: 'Browser storage is unavailable. You can play, but progress may not be saved.',
		};
		if (this.saveStatus && recoveryMessages[storageStatus]) this.saveStatus.textContent = recoveryMessages[storageStatus];
		if (this.resumeSavedGameButton) this.resumeSavedGameButton.addEventListener('click', () => this.resumeSavedGame());
		if (this.startNewFromSaveButton) this.startNewFromSaveButton.addEventListener('click', () => this.startNewGameFromSavedGame());
		if (this.clearSavedGameButton) this.clearSavedGameButton.addEventListener('click', () => this.clearSavedGame());
		if (this.savedGameDialog) this.savedGameDialog.addEventListener('cancel', event => event.preventDefault());
		if (savedGame && this.savedGameDialog && typeof this.savedGameDialog.showModal === 'function') {
			if (this.saveStatus) this.saveStatus.textContent = 'A saved game is available. Resume it or start a new game.';
			this.savedGameDialog.showModal();
			return true;
		}
		return false;
	}

	resumeSavedGame() {
		const savedGame = loadGameFromStorage();
		if (!savedGame || !this.restoreSavedGame(savedGame)) {
			if (this.saveStatus) this.saveStatus.textContent = 'The saved game could not be restored.';
			return false;
		}
		if (this.savedGameDialog && this.savedGameDialog.open) this.savedGameDialog.close();
		if (this.clearSavedGameButton) this.clearSavedGameButton.hidden = false;
		if (this.saveStatus) this.saveStatus.textContent = 'Saved game restored. Future moves are saved in this browser.';
		return true;
	}

	startNewGameFromSavedGame() {
		const cleared = clearGameSaveFromStorage();
		if (this.savedGameDialog && this.savedGameDialog.open) this.savedGameDialog.close();
		if (this.clearSavedGameButton) this.clearSavedGameButton.hidden = true;
		if (this.saveStatus) this.saveStatus.textContent = cleared
			? 'Saved game cleared. A new game is ready.'
			: 'A new game is ready, but browser storage could not be cleared.';
		return true;
	}

	clearSavedGame() {
		if (!clearGameSaveFromStorage()) {
			if (this.saveStatus) this.saveStatus.textContent = 'Browser storage could not be cleared. The current game continues.';
			return false;
		}
		if (this.clearSavedGameButton) this.clearSavedGameButton.hidden = true;
		if (this.saveStatus) this.saveStatus.textContent = 'Saved game cleared. The current game continues; future moves will be saved again.';
		return true;
	}

	persistCurrentGame() {
		const saved = saveGameToStorage(this);
		if (saved) {
			if (this.clearSavedGameButton) this.clearSavedGameButton.hidden = false;
			if (this.saveStatus) this.saveStatus.textContent = 'Game progress saved in this browser.';
		}
		else if (this.saveStatus) this.saveStatus.textContent = 'This move is safe, but browser storage could not save it. Keep this tab open to avoid losing progress.';
		return saved;
	}

	startNewGame() {
		const hasProgress = !this.gameOver && ((this.moveHistory && this.moveHistory.length > 0) ||
			Boolean(this.pendingPromotion || this.pendingHistoryMove) ||
			(this.undoStack && this.undoStack.length > 0));
		if (hasProgress && !window.confirm('Start a new game? The current game and move history will be discarded.')) return false;
		clearGameSaveFromStorage();
		window.location.reload();
		return true;
	}

	requestResignation() {
		if (this.gameOver || this.pendingPromotion) return false;
		if (!window.confirm('Resign this game? Your opponent will win.')) return false;
		const resigningColor = this.turn;
		const winner = resigningColor === 'white' ? 'Black' : 'White';
		this.finishGame(`${resigningColor.charAt(0).toUpperCase() + resigningColor.slice(1)} resigns. ${winner} wins.`);
		return true;
	}

	finishGame(message) {
		if (this.gameOver) return false;
		this.gameOver = true;
		clearGameSaveFromStorage();
		if (this.clearSavedGameButton) this.clearSavedGameButton.hidden = true;
		if (this.saveStatus) this.saveStatus.textContent = 'Game ended. Saved progress was cleared.';
		this.playStatusSound('game-end');
		if (this.clock && typeof this.clock.stop === 'function') this.clock.stop();
		this.updateClockControls();
		const endScene = document.getElementById('endscene');
		const result = endScene.getElementsByClassName('winning-sign')[0];
		result.textContent = message;
		this.gameStatus.textContent = message;
		this.gameStatus.classList.remove('is-check');
		if (this.resignButton) this.resignButton.disabled = true;
		this.updateHistoryControls();
		endScene.classList.add('show');
		return true;
	}

	hasMatingMaterial(color) {
		const material = this.getPiecesByColor(color).filter(piece => piece.rank !== 'king');
		if (material.some(piece => ['pawn', 'rook', 'queen'].includes(piece.rank))) return true;
		const bishops = material.filter(piece => piece.rank === 'bishop');
		const knights = material.filter(piece => piece.rank === 'knight');
		if (bishops.length && knights.length) return true;
		if (knights.length >= 2) return true;
		if (bishops.length >= 2) {
			const squareColor = position => (Math.floor(position / 10) + position % 10) % 2;
			return new Set(bishops.map(bishop => squareColor(bishop.position))).size > 1;
		}
		return false;
	}

	handleTimeout(flaggedColor) {
		if (this.gameOver || !['white', 'black'].includes(flaggedColor)) return false;
		const winner = flaggedColor === 'white' ? 'black' : 'white';
		const capitalize = color => color.charAt(0).toUpperCase() + color.slice(1);
		const message = this.hasMatingMaterial(winner)
			? `${capitalize(flaggedColor)} ran out of time. ${capitalize(winner)} wins.`
			: `${capitalize(flaggedColor)} ran out of time. Draw — ${capitalize(winner)} cannot checkmate.`;
		return this.finishGame(message);
	}

	myKingChecked(pos, kill=true, capturedPiece=null){
		const piece = this.clickedPiece;
		const originalPosition = piece.position;
		const pieceToCapture = capturedPiece || this.getPieceByPos(pos);
		const should_kill_other_piece = kill && pieceToCapture && pieceToCapture.rank != 'king';
		piece.changePosition(pos);
		if (should_kill_other_piece) this.pieces.splice(this.pieces.indexOf(pieceToCapture), 1);
		if (this.king_checked(piece.color)) {
			piece.changePosition(originalPosition);
			if (should_kill_other_piece) this.pieces.push(pieceToCapture);
			return 1;
		}
		else{
			piece.changePosition(originalPosition);
			if (should_kill_other_piece) this.pieces.push(pieceToCapture);
			return 0;
		}
	}

	setLastMoveHighlight(moves) {
		this.lastMove = moves.flatMap(move => [parseInt(move.from), parseInt(move.to)]);
		const board = this.board || document.getElementById('board');
		if (board && typeof board.querySelectorAll === 'function') {
			board.querySelectorAll('.last-move').forEach(square => {
				if (square.classList && typeof square.classList.remove === 'function') square.classList.remove('last-move');
			});
		}
		this.lastMove.forEach(position => {
			const square = document.getElementById(position);
			if (square && square.classList && typeof square.classList.add === 'function') square.classList.add('last-move');
		});
	}

	king_dead(color) {
		const pieces = this.getPiecesByColor(color);
		for (const piece of pieces) {
			this.setClickedPiece(piece);
			const allowedMoves = this.unblockedPositions( piece.getAllowedMoves(), piece.position, piece.color, true );
			if (allowedMoves.length) {
				this.setClickedPiece(null);
				return 0;
			}
		}
		this.setClickedPiece(null);
		return 1;
	}

	getGameOutcome(color) {
		const checked = this.king_checked(color);
		const noLegalMoves = this.king_dead(color);
		if (noLegalMoves) return checked ? 'checkmate' : 'stalemate';
		if (this.hasInsufficientMaterial()) return 'insufficient-material';
		if (this.halfmoveClock >= 100) return 'fifty-move-draw';
		if (this.hasThreefoldRepetition()) return 'threefold-repetition';
		return checked ? 'check' : 'ongoing';
	}

	restoreSavedGame(save) {
		if (!save || validateGameSave(save).length) return false;
		const state = save.state;
		const existingPieces = [...this.pieces];
		const savedNames = new Set(state.pieces.map(piece => piece.name));
		const unusedPawns = existingPieces.filter(piece => piece.rank === 'pawn' && !savedNames.has(piece.name));
		const promotedRecords = state.pieces.filter(piece => !existingPieces.some(candidate => candidate.name === piece.name));
		if (promotedRecords.length > unusedPawns.length) return false;
		const rankClasses = { king: King, queen: Queen, rook: Rook, bishop: Bishop, knight: Knight, pawn: Pawn };
		const usedPieces = new Set();
		const restoredPieces = [];
		for (const record of state.pieces) {
			let piece = existingPieces.find(candidate => candidate.name === record.name && candidate.rank === record.rank);
			if (!piece) {
				const pawnImage = unusedPawns.find(candidate => !usedPieces.has(candidate));
				if (!pawnImage) return false;
				piece = new rankClasses[record.rank](record.position, record.name);
				piece.img = pawnImage.img;
				usedPieces.add(pawnImage);
			}
			piece.position = record.position;
			if (typeof record.ableToCastle === 'boolean') piece.ableToCastle = record.ableToCastle;
			piece.img.id = record.name;
			piece.img.className = `piece ${record.rank}`;
			piece.img.src = `./assets/img/${record.color}${record.rank.charAt(0).toUpperCase()}${record.rank.slice(1)}.png`;
			piece.img.alt = `${record.color} ${record.rank}`;
			const square = document.getElementById(record.position);
			if (!square) return false;
			square.append(piece.img);
			usedPieces.add(piece);
			restoredPieces.push(piece);
		}
		for (const piece of existingPieces) {
			if (usedPieces.has(piece)) continue;
			piece.img.className = '';
			const cemetery = piece.color === 'white' ? this.whiteSematary : this.blackSematary;
			const grave = cemetery && cemetery.querySelector(`.${piece.rank}`);
			if (grave) grave.append(piece.img);
		}
		this.pieces = restoredPieces;
		this.turn = state.turn;
		this.enPassantTarget = state.enPassantTarget;
		this.enPassantPawn = restoredPieces.find(piece => piece.name === state.enPassantPawn) || null;
		this.halfmoveClock = state.halfmoveClock;
		this.moveHistory = [...state.moveHistory];
		this.positionCounts = new Map(state.positionCounts);
		this.lastMove = state.lastMove ? [...state.lastMove] : null;
		if (this.turnSign) this.turnSign.textContent = this.turn === 'white' ? "White's Turn" : "Black's Turn";
		this.renderMoveHistory();
		this.updateBoardAccessibleNames();
		this.clearSquares();
		if (this.lastMove) {
			const moves = [];
			for (let index = 0; index < this.lastMove.length; index += 2) {
				moves.push({ from: this.lastMove[index], to: this.lastMove[index + 1] });
			}
			this.setLastMoveHighlight(moves);
		}
		if (state.clock) {
			const clock = new ChessClock({
				whiteSeconds: state.clock.whiteMilliseconds / 1000,
				blackSeconds: state.clock.blackMilliseconds / 1000,
				incrementSeconds: state.clock.incrementMilliseconds / 1000,
				activeColor: state.clock.activeColor,
				onTick: clockState => this.updateClockDisplay(clockState),
			});
			clock.flaggedColor = state.clock.flaggedColor;
			if (state.clock.running) this.attachClock(clock);
			else {
				this.clock = clock;
				this.updateClockDisplay({
					activeColor: clock.activeColor,
					whiteSeconds: clock.getRemainingSeconds('white'),
					blackSeconds: clock.getRemainingSeconds('black'),
					running: false,
				});
			}
		}
		this.updateClockControls();
		this.updateCheckStatus();
		return true;
	}

	getAvailableEnPassantTarget() {
		if (this.enPassantTarget == null || !this.enPassantPawn) return null;
		const previousPiece = this.clickedPiece;
		const target = parseInt(this.enPassantTarget);
		for (const pawn of this.pieces.filter(piece => piece.rank === 'pawn' && piece.color === this.turn)) {
			this.setClickedPiece(pawn);
			const legalMoves = this.unblockedPositions(pawn.getAllowedMoves(), pawn.position, pawn.color, true);
			if (legalMoves.includes(target)) {
				this.setClickedPiece(previousPiece);
				return target;
			}
		}
		this.setClickedPiece(previousPiece);
		return null;
	}

	getPositionKey() {
		const board = this.pieces
			.map(piece => `${piece.color}:${piece.rank}:${parseInt(piece.position)}`)
			.sort()
			.join(',');
		const castlingRights = ['white', 'black'].map(color => {
			const king = this.getPieceByName(color + 'King');
			if (!king || !king.ableToCastle) return `${color}:-`;
			const queenSideRook = this.getPieceByName(color + 'Rook1');
			const kingSideRook = this.getPieceByName(color + 'Rook2');
			return `${color}:${queenSideRook && queenSideRook.ableToCastle ? 'Q' : ''}${kingSideRook && kingSideRook.ableToCastle ? 'K' : ''}`;
		}).join(',');
		const enPassant = this.getAvailableEnPassantTarget();
		return JSON.stringify([this.turn, board, castlingRights, enPassant]);
	}

	toFEN() {
		return serializeGameToFEN(this);
	}

	recordPosition() {
		if (!this.positionCounts) this.positionCounts = new Map();
		const key = this.getPositionKey();
		const count = (this.positionCounts.get(key) || 0) + 1;
		this.positionCounts.set(key, count);
		return count;
	}

	hasThreefoldRepetition() {
		if (!this.positionCounts) return false;
		return (this.positionCounts.get(this.getPositionKey()) || 0) >= 3;
	}

	hasInsufficientMaterial() {
		const kings = this.pieces.filter(piece => piece.rank === 'king');
		if (kings.length !== 2) return false;

		const material = this.pieces.filter(piece => piece.rank !== 'king');
		if (material.length === 0) return true;
		if (material.some(piece => ['pawn', 'rook', 'queen'].includes(piece.rank))) return false;
		if (material.length === 1) return ['bishop', 'knight'].includes(material[0].rank);
		if (!material.every(piece => piece.rank === 'bishop')) return false;

		const squareColor = position => (Math.floor(position / 10) + position % 10) % 2;
		const bishopsColor = squareColor(material[0].position);
		return material.every(piece => squareColor(piece.position) === bishopsColor);
	}

	king_checked(color) {
		const piece = this.clickedPiece;
		const king = this.getPieceByName(color + 'King');
		const enemyColor = (color == 'white') ? 'black' : 'white';
		const enemyPieces = this.getPiecesByColor(enemyColor);
		for (const enemyPiece of enemyPieces) {
			this.setClickedPiece(enemyPiece);
			const allowedMoves = this.unblockedPositions( enemyPiece.getAllowedMoves(), enemyPiece.position, enemyColor, false );
			if (allowedMoves.indexOf(king.position) != -1) {
				this.setClickedPiece(piece);
				return 1;
			}
		}
		this.setClickedPiece(piece);
		return 0;
	}

	clearSquares(){
		this.allowedMoves = null;
		const allowedSquares = this.board.querySelectorAll('.allowed');
		allowedSquares.forEach(allowedSquare => {
			allowedSquare.classList.remove('allowed');
			['allowed-quiet', 'allowed-capture', 'allowed-en-passant', 'allowed-castling']
				.forEach(kind => allowedSquare.classList.remove(kind));
		});
		const selectedSquares = this.board.querySelectorAll('.selected-square');
		selectedSquares.forEach(selectedSquare => selectedSquare.classList.remove('selected-square'));
		if (this.selectionStatus) this.selectionStatus.textContent = '';
	}

	checkmate(color){
		const winner = color.charAt(0).toUpperCase() + color.slice(1);
		this.finishGame('Checkmate. ' + winner + ' wins.');
	}

	stalemate() {
		this.finishGame('Draw by stalemate.');
	}

	drawByInsufficientMaterial() {
		this.finishGame('Draw by insufficient material.');
	}

	drawByFiftyMoveRule() {
		this.finishGame('Draw by the fifty-move rule.');
	}

	drawByThreefoldRepetition() {
		this.finishGame('Draw by threefold repetition.');
	}
}

const pieces = [
	new Rook(11, 'whiteRook1'),
	new Knight(12, 'whiteKnight1'),
	new Bishop(13, 'whiteBishop1'),
	new Queen(14, 'whiteQueen'),
	new King(15, 'whiteKing'),
	new Bishop(16, 'whiteBishop2'),
	new Knight(17, 'whiteKnight2'),
	new Rook(18, 'whiteRook2'),
	new Pawn(21, 'whitePawn1'),
	new Pawn(22, 'whitePawn2'),
	new Pawn(23, 'whitePawn3'),
	new Pawn(24, 'whitePawn4'),
	new Pawn(25, 'whitePawn5'),
	new Pawn(26, 'whitePawn6'),
	new Pawn(27, 'whitePawn7'),
	new Pawn(28, 'whitePawn8'),

	new Pawn(71, 'blackPawn1'),
	new Pawn(72, 'blackPawn2'),
	new Pawn(73, 'blackPawn3'),
	new Pawn(74, 'blackPawn4'),
	new Pawn(75, 'blackPawn5'),
	new Pawn(76, 'blackPawn6'),
	new Pawn(77, 'blackPawn7'),
	new Pawn(78, 'blackPawn8'),
	new Rook(81, 'blackRook1'),
	new Knight(82, 'blackKnight1'),
	new Bishop(83, 'blackBishop1'),
	new Queen(84, 'blackQueen'),
	new King(85, 'blackKing'),
	new Bishop(86, 'blackBishop2'),
	new Knight(87, 'blackKnight2'),
	new Rook(88, 'blackRook2')
];

const game = new Game(pieces);
