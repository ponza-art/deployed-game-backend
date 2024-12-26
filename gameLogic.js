const fs = require('fs');
const path = require('path');

class SurvivalPathGame {
  constructor() {
    this.name = "survival-path";
    this.rooms = {};
    this.cards = this.loadCards();
    this.ROUNDS_PER_GAME = 3;
    this.ROUND_TIME = 300; // 5 minutes in seconds
    this.MIN_PLAYERS = 2;
    this.WINNING_POINTS = 20;
  }

  /**
   * Loads card data from a JSON file.
   * @returns {Array} The card data.
   */
  loadCards() {
    const filePath = path.resolve(__dirname, 'cards.json');
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (error) {
      console.error("Error loading cards:", error);
      return [];
    }
  }

  /**
   * Sets up the initial game state.
   * @returns {Object} The initial game state.
   */
  setup() {
    const cardDeck = this.shuffleDeck([...this.cards]);
    const board = Array.from({ length: 45 }, (_, i) => i + 1);
    return {
      players: {},
      board,
      cardDeck,
      turn: 0,
      turnOrder: [],
      currentTurn: null,
      winner: null,
      timer: 30,
      currentRound: 1,
      roundTimer: this.ROUND_TIME,
      roundWinners: [],
      gameStarted: false,
    };
  }

  /**
   * Creates a new game room.
   * @param {string} roomId - The room ID.
   */
  createRoom(roomId) {
    if (this.rooms[roomId]) {
      throw new Error(`Room with ID ${roomId} already exists.`);
    }
    this.rooms[roomId] = {
      gameState: this.setup(),
      players: {},
      timerInterval: null,
      roundInterval: null,
    };
    console.log(`Room ${roomId} created.`);
  }

  /**
   * Adds a player to a room.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   * @param {string} username - The player's username.
   */
  addPlayerToRoom(roomId, playerId, username) {
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room with ID ${roomId} does not exist.`);
    }

    if (room.players[playerId]) {
      throw new Error(`Player ${username} is already in the room.`);
    }

    const newPlayer = {
      username: username || `Player ${Object.keys(room.players).length + 1}`,
      position: 0,
      score: 0,
      hand: this.drawCards(roomId, 3),
      roundWins: 0,
    };

    room.players[playerId] = newPlayer;
    room.gameState.turnOrder.push(playerId);

    if (Object.keys(room.players).length >= this.MIN_PLAYERS) {
      room.gameState.gameStarted = true;
      this.startRound(roomId);
    }

    if (room.gameState.turnOrder.length === 1) {
      room.gameState.currentTurn = playerId;
    }

    console.log(`Player ${username} added to room ${roomId}.`);
  }

  /**
   * Handles playing a card.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   * @param {number} cardIndex - The index of the card to play.
   * @param {string} [targetPlayerId] - The targeted player's ID (if applicable).
   * @returns {Object} Result of the card play.
   */
  playCard(roomId, playerId, cardIndex, targetPlayerId = null) {
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room with ID ${roomId} does not exist.`);
    }

    const player = room.players[playerId];
    if (!player) {
      throw new Error(`Player with ID ${playerId} not found in room ${roomId}.`);
    }

    if (room.gameState.currentTurn !== playerId) {
      throw new Error(`It's not your turn.`);
    }

    if (cardIndex < 0 || cardIndex >= player.hand.length) {
      throw new Error(`Invalid card index.`);
    }

    const card = player.hand[cardIndex];

    if (card.type === "Move") {
      player.position += card.value;
      player.score += card.value;
    } else if (card.type === "Event") {
      this.handleEventCard(roomId, playerId, card);
    } else if (card.type === "Mind Play") {
      if (!targetPlayerId || !room.players[targetPlayerId]) {
        throw new Error(`Target player ID ${targetPlayerId} is invalid.`);
      }
      this.handleMindPlayCard(roomId, playerId, targetPlayerId, card);
    }

    player.hand.splice(cardIndex, 1);
    const newCards = this.drawCards(roomId, 1);
    player.hand.push(...newCards);

    if (player.position >= 45) {
      this.endRound(roomId);
      return { message: `${player.username} has won round ${room.gameState.currentRound}!` };
    }

    this.endTurn(roomId);

    return {
      message: `${player.username} played a card.`,
      hand: player.hand,
    };
  }

  /**
   * Handles an event card effect.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   * @param {Object} card - The event card.
   */
  handleEventCard(roomId, playerId, card) {
    const room = this.rooms[roomId];
    const player = room.players[playerId];

    switch (card.effect) {
      case "Swap Places":
        if (!targetPlayerId) {
          throw new Error("Target player is required for Swap Places card");
        }
        this.swapPlaces(roomId, playerId, targetPlayerId);
        break;
      case "Shuffle Board":
        this.shuffleBoard(roomId);
        break;
      case "Free Move":
        player.position += card.value;
        player.score += card.value;
        console.log(`${player.username} moved ${card.value} spaces for free.`);
        break;
      case "Draw 1 for Everyone":
        this.drawForEveryone(roomId);
        break;
      case "Bonus Round":
        player.score += 10;
        console.log(`${player.username} received a bonus round with 10 points.`);
        break;
      default:
        console.log(`Unknown event card effect: ${card.effect}`);
    }
  }

  /**
   * Swaps positions with a random other player.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   */
  swapPlaces(roomId, playerId, targetPlayerId) {
    const room = this.rooms[roomId];
    const player = room.players[playerId];
    const targetPlayer = room.players[targetPlayerId];

    if (!targetPlayer) {
      throw new Error("Target player not found");
    }

    const tempPosition = player.position;
    player.position = targetPlayer.position;
    targetPlayer.position = tempPosition;

    console.log(`${player.username} swapped places with ${targetPlayer.username}.`);
  }

  /**
   * Shuffles the game board.
   * @param {string} roomId - The room ID.
   */
  shuffleBoard(roomId) {
    const room = this.rooms[roomId];
    if (!room || !room.gameState.board) {
      throw new Error(`Board not found for room ${roomId}.`);
    }

    room.gameState.board.sort(() => Math.random() - 0.5);
    console.log(`Board shuffled for room ${roomId}:`, room.gameState.board);
  }

  /**
   * Draws cards for every player in the room.
   * @param {string} roomId - The room ID.
   */
  drawForEveryone(roomId) {
    const room = this.rooms[roomId];
    Object.keys(room.players).forEach(playerId => {
      const newCards = this.drawCards(roomId, 1);
      room.players[playerId].hand.push(...newCards);
    });
    console.log("Each player drew 1 card.");
  }

  /**
   * Gives a bonus round to a player.
   * @param {Object} player - The player object.
   */
  giveBonusRound(player) {
    player.score += 10;
    console.log(`${player.username} received a bonus round with 10 points.`);
  }

  /**
   * Draws a specified number of cards for a room.
   * @param {string} roomId - The room ID.
   * @param {number} count - The number of cards to draw.
   * @returns {Array} The drawn cards.
   */
  drawCards(roomId, count) {
    const room = this.rooms[roomId];
    const cards = [];

    for (let i = 0; i < count; i++) {
      if (room.gameState.cardDeck.length === 0) {
        room.gameState.cardDeck = this.shuffleDeck([...this.cards]);
        console.log("Deck reset and shuffled:", room.gameState.cardDeck);
      }
      cards.push(room.gameState.cardDeck.pop());
    }

    return cards;
  }

  /**
   * Shuffles a deck of cards.
   * @param {Array} deck - The deck to shuffle.
   * @returns {Array} The shuffled deck.
   */
  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  /**
   * Handles a "Mind Play" card effect.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   * @param {string} targetPlayerId - The targeted player ID.
   * @param {Object} card - The Mind Play card.
   */
  handleMindPlayCard(roomId, playerId, targetPlayerId, card) {
    const room = this.rooms[roomId];
    const targetPlayer = room.players[targetPlayerId];

    switch (card.effect) {
      case "Discard Opponent Card":
        if (targetPlayer.hand.length > 0) {
          const discardedCard = targetPlayer.hand.pop();
          console.log(`${targetPlayer.username} discarded a card:`, discardedCard);
        } else {
          console.log(`${targetPlayer.username} has no cards to discard.`);
        }
        break;

      case "Skip Opponent Turn":
        targetPlayer.isBlocked = true;
        console.log(`${targetPlayer.username}'s next turn will be skipped.`);
        break;

      case "Steal 5 Points":
        const stolenPoints = Math.min(targetPlayer.score, card.value);
        targetPlayer.score -= stolenPoints;
        room.players[playerId].score += stolenPoints;
        console.log(`${playerId} stole ${stolenPoints} points from ${targetPlayer.username}.`);
        break;

      case "Steal A Random Card From Opponent":
        console.log("Loaded card effects:", this.cards.map(card => card.effect));
        if (targetPlayer.hand.length > 0) {
          const randomIndex = Math.floor(Math.random() * targetPlayer.hand.length);
          const stolenCard = targetPlayer.hand.splice(randomIndex, 1)[0];
          room.players[playerId].hand.push(stolenCard);
          console.log(`${playerId} stole a random card from ${targetPlayer.username}.`);
        } else {
          console.log(`${targetPlayer.username} has no cards to steal.`);
        }
        break;

      default:
        
        console.log("Loaded card effects:", this.cards.map(card => console.log(card)));
        console.log(`Unknown Mind Play card effect: ${card.effect}`);
    }
  }

  /**
   * Starts the turn timer for a room.
   * @param {string} roomId - The room ID.
   * @param {Object} io - The socket.io instance.
   */
  startTimer(roomId, io) {
    const room = this.rooms[roomId];
    if (!room) return;

    clearInterval(room.timerInterval);
    room.gameState.timer = 30;

    room.timerInterval = setInterval(() => {
      room.gameState.timer--;
      io.to(roomId).emit("timerUpdate", { timer: room.gameState.timer });

      if (room.gameState.timer <= 0) {
        clearInterval(room.timerInterval);
        this.endTurn(roomId);
        io.to(roomId).emit("timerExpired");
        io.to(roomId).emit("gameState", this.getGameState(roomId));
        this.startTimer(roomId, io);
      }
    }, 1000);
  }

  /**
   * Ends the current turn and moves to the next.
   * @param {string} roomId - The room ID.
   */
  endTurn(roomId) {
    const room = this.rooms[roomId];
    const currentTurnIndex = room.gameState.turnOrder.indexOf(room.gameState.currentTurn);
    let nextTurnIndex = (currentTurnIndex + 1) % room.gameState.turnOrder.length;

    const nextPlayerId = room.gameState.turnOrder[nextTurnIndex];
    if (room.players[nextPlayerId].isBlocked) {
        room.players[nextPlayerId].isBlocked = false;
        nextTurnIndex = (nextTurnIndex + 1) % room.gameState.turnOrder.length;
        console.log(`${nextPlayerId}'s turn was skipped due to being blocked.`);
    }

    room.gameState.currentTurn = room.gameState.turnOrder[nextTurnIndex];
    room.gameState.turn++;
  }

  /**
   * Gets the current game state for a room.
   * @param {string} roomId - The room ID.
   * @returns {Object} The game state.
   */
  getGameState(roomId) {
    const room = this.rooms[roomId];
    if (!room) {
      throw new Error(`Room with ID ${roomId} does not exist.`);
    }
    return {
      gameState: room.gameState,
      players: room.players,
    };
  }

  startRound(roomId) {
    const room = this.rooms[roomId];
    if (!room) return;

    // Reset positions for new round
    Object.values(room.players).forEach(player => {
      player.position = 0;
    });

    // Start round timer
    clearInterval(room.roundInterval);
    room.gameState.roundTimer = this.ROUND_TIME;

    room.roundInterval = setInterval(() => {
      room.gameState.roundTimer--;
      
      if (room.gameState.roundTimer <= 0) {
        this.endRound(roomId);
      }
    }, 1000);
  }

  endRound(roomId) {
    const room = this.rooms[roomId];
    if (!room) return;

    clearInterval(room.roundInterval);

    // Find round winner
    const winner = Object.entries(room.players)
      .reduce((prev, [id, player]) => {
        return (!prev || player.position > room.players[prev].position) ? id : prev;
      }, null);

    if (winner) {
      room.players[winner].roundWins++;
      room.players[winner].score += this.WINNING_POINTS;
      room.gameState.roundWinners.push(winner);
    }

    // Check if game is complete
    if (room.gameState.currentRound >= this.ROUNDS_PER_GAME) {
      this.endGame(roomId);
    } else {
      room.gameState.currentRound++;
      this.startRound(roomId);
    }
  }

  endGame(roomId) {
    const room = this.rooms[roomId];
    if (!room) return;

    // Find overall winner
    const gameWinner = Object.entries(room.players)
      .reduce((prev, [id, player]) => {
        return (!prev || player.score > room.players[prev].score) ? id : prev;
      }, null);

    room.gameState.winner = gameWinner;
    clearInterval(room.roundInterval);
    clearInterval(room.timerInterval);
  }
}

module.exports = SurvivalPathGame;