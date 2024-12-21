const fs = require('fs');
const path = require('path');

class SurvivalPathGame {
  constructor() {
    this.name = "survival-path";
    this.rooms = {};
    this.cards = this.loadCards();
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
    const board = Array.from({ length: 45 }, (_, i) => i + 1); // Initialize board with values 1 to 20
    return {
      players: {},
      board,
      cardDeck,
      turn: 0,
      turnOrder: [],
      currentTurn: null,
      winner: null,
      timer: 30,
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
    };

    room.players[playerId] = newPlayer;
    room.gameState.turnOrder.push(playerId);

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
   * @returns {Object} Result of the card play.
   */
  playCard(roomId, playerId, cardIndex) {
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
      player.score += card.value * 10;
    } else if (card.type === "Event") {
      this.handleEventCard(roomId, playerId, card);
    }

    player.hand.splice(cardIndex, 1);
    const newCards = this.drawCards(roomId, 1);
    player.hand.push(...newCards);

    if (player.position >= room.gameState.board.length) {
      room.gameState.winner = playerId;
      clearInterval(room.timerInterval);
      return { message: `🎉 ${player.username} has won the game!` };
    }

    this.endTurn(roomId);

    return {
      message: `${player.username} moved to position ${player.position}.`,
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
        this.swapPlaces(roomId, playerId);
        break;
      case "Shuffle Board":
        this.shuffleBoard(roomId);
        break;
      case "Free Move":
        player.position += card.value;
        break;
      case "Draw 1 for Everyone":
        this.drawForEveryone(roomId);
        break;
      case "Bonus Round":
        this.giveBonusRound(player);
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
  swapPlaces(roomId, playerId) {
    const room = this.rooms[roomId];
    const player = room.players[playerId];

    const otherPlayers = Object.values(room.players).filter(p => p !== player);
    if (otherPlayers.length === 0) return;

    const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    const tempPosition = player.position;
    player.position = randomPlayer.position;
    randomPlayer.position = tempPosition;

    console.log(`${player.username} swapped places with ${randomPlayer.username}.`);
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
  
    // Shuffle the board directly
    room.gameState.board = room.gameState.board.sort(() => Math.random() - 0.5);
  
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
    player.score += 50;
    console.log(`${player.username} received a bonus round with 50 points.`);
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
        io.to(roomId).emit("gameState", this.getGameState(roomId));
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
    const nextTurnIndex = (currentTurnIndex + 1) % room.gameState.turnOrder.length;
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
}

module.exports = SurvivalPathGame;
