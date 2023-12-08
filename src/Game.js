console.log(
  "2D Chess Game Made by David Maina \nhttps://davymaish.github.io"
);

class Game {
	constructor(pieces) {
		this.board   = document.getElementById('board');
		this.squares = this.board.querySelectorAll('.square');
		this.pieces  = pieces;
		this.turn    = 'white';
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
		this.halfmoveClock = 0;
		this.pendingCapture = false;
		this.isCastlingRookMove = false;
		this.positionCounts = new Map();
		this.recordPosition();
		this.turnSign = document.getElementById('turn');
		this.gameStatus = document.getElementById('game-status');
		this.clickedPiece = null;
		this.allowedMoves = null;
		this.addEventListeners();
		this.whiteSematary = document.getElementById('whiteSematary');
		this.blackSematary = document.getElementById('blackSematary');
		this.updateCheckStatus();
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

	pieceMove(event) {
		const name = event.target.getAttribute('id');
		const allowedMoves = this.getPieceAllowedMoves(event, name);
		if (allowedMoves) {
			const position = this.getPieceByName(name).position;
			const clickedSquare = document.getElementById(position);

			/*if (event.type == 'click' && this.clickedPiece && this.clickedPiece.name == name) {
				this.setClickedPiece(null);
				return this.clearSquares();
			}*/
			clickedSquare.classList.add('clicked-square');

			allowedMoves.forEach( allowedMove => {
				if (document.body.contains(document.getElementById(allowedMove))) {
					document.getElementById(allowedMove).classList.add('allowed');		
				}	
			});
		}
		else{
			this.clearSquares();
		}
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
			this.clearSquares();
			if (!this.pendingPromotion) this.finishMove(clickedPiece.color);
		}
		if (event) event.preventDefault();
	}

	finishMove(movingColor) {
		this.changeTurn();
		if (!this.isCastlingRookMove) this.recordPosition();
		const outcome = this.getGameOutcome(this.turn);
		if (!this.isCastlingRookMove && this.pendingHistoryMove) {
			this.pendingHistoryMove.checkSuffix = outcome === 'checkmate' ? '#' : outcome === 'check' ? '+' : '';
			this.recordMoveHistory(this.pendingHistoryMove);
			this.pendingHistoryMove = null;
		}
		if (!this.isCastlingRookMove) this.commitPendingUndoMove();
		this.updateCheckStatus(outcome === 'check' || outcome === 'checkmate');
		if (outcome === 'checkmate') this.checkmate(movingColor);
		else if (outcome === 'stalemate') this.stalemate();
		else if (outcome === 'insufficient-material') this.drawByInsufficientMaterial();
		else if (outcome === 'fifty-move-draw') this.drawByFiftyMoveRule();
		else if (outcome === 'threefold-repetition') this.drawByThreefoldRepetition();
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
	}

	undoMove() {
		if (!Array.isArray(this.undoStack) || this.undoStack.length === 0) return false;
		const entry = this.undoStack[this.undoStack.length - 1];
		if (!entry.supported) return false;
		this.undoStack.pop();
		this.redoStack.push(entry);
		this.restoreMoveState(entry.before, entry);
		return true;
	}

	redoMove() {
		if (!Array.isArray(this.redoStack) || this.redoStack.length === 0) return false;
		const entry = this.redoStack.pop();
		this.undoStack.push(entry);
		this.restoreMoveState(entry.after, entry);
		return true;
	}

		restoreMoveState(state, entry = null) {
			this.pieces = state.pieces.map(entry => entry.piece);
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
		if (this.turnSign) this.turnSign.innerHTML = this.turn === 'white' ? "White's Turn" : "Black's Turn";
		this.renderMoveHistory();
		if (typeof this.clearSquares === 'function') this.clearSquares();
		this.refreshOutcomeDisplay();
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
		allowedSquares.forEach( allowedSquare => allowedSquare.classList.remove('allowed') );
		const cllickedSquare = document.getElementsByClassName('clicked-square')[0];
		if (cllickedSquare) cllickedSquare.classList.remove('clicked-square');
	}

	checkmate(color){
		const endScene = document.getElementById('endscene');
		const winner = color.charAt(0).toUpperCase() + color.slice(1);
		endScene.getElementsByClassName('winning-sign')[0].textContent = 'Checkmate. ' + winner + ' wins.';
		endScene.classList.add('show');
	}

	stalemate() {
		const message = 'Draw by stalemate.';
		const endScene = document.getElementById('endscene');
		endScene.getElementsByClassName('winning-sign')[0].textContent = message;
		this.gameStatus.textContent = message;
		this.gameStatus.classList.remove('is-check');
		endScene.classList.add('show');
	}

	drawByInsufficientMaterial() {
		const message = 'Draw by insufficient material.';
		const endScene = document.getElementById('endscene');
		endScene.getElementsByClassName('winning-sign')[0].textContent = message;
		this.gameStatus.textContent = message;
		this.gameStatus.classList.remove('is-check');
		endScene.classList.add('show');
	}

	drawByFiftyMoveRule() {
		const message = 'Draw by the fifty-move rule.';
		const endScene = document.getElementById('endscene');
		endScene.getElementsByClassName('winning-sign')[0].textContent = message;
		this.gameStatus.textContent = message;
		this.gameStatus.classList.remove('is-check');
		endScene.classList.add('show');
	}

	drawByThreefoldRepetition() {
		const message = 'Draw by threefold repetition.';
		const endScene = document.getElementById('endscene');
		endScene.getElementsByClassName('winning-sign')[0].textContent = message;
		this.gameStatus.textContent = message;
		this.gameStatus.classList.remove('is-check');
		endScene.classList.add('show');
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
