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
    const board = Array.from({ length: 45 }, (_, i) => i + 1); // Initialize board with values 1 to 45
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
   * @param {string} [targetPlayerId] - The targeted player's ID (if applicable).
   * @returns {Object} Result of the card play.
   */
  playCard(roomId, playerId, cardIndex, targetPlayerId = null) {
    const room = this.rooms[roomId];
    const player = room.players[playerId];

    if (!room || !player) {
      throw new Error("Invalid room or player");
    }

    if (cardIndex < 0 || cardIndex >= player.hand.length) {
      throw new Error("Invalid card index");
    }

    if (player.skipNextTurn) {
      player.skipNextTurn = false;
      throw new Error("You must skip this turn");
    }

    const card = player.hand[cardIndex];
    player.hand.splice(cardIndex, 1);

    let actionResult = {
      message: `${player.username} played ${card.effect}`,
      playedCard: card
    };

    if (card.type === "Move") {
      player.position += card.value;
      player.score += card.value;
      actionResult.message = `${player.username} moved ${card.value} steps`;
    } else if (card.type === "Event") {
      this.handleEventCard(roomId, playerId, card);
      actionResult.message = `${player.username} played ${card.effect}`;
    } else if (card.type === "Mind Play") {
      if (!targetPlayerId) {
        throw new Error("Target player is required for Mind Play cards");
      }
      this.handleMindPlayCard(roomId, playerId, targetPlayerId, card);
      actionResult.message = `${player.username} used ${card.effect}`;
    }

    // Draw a new card
    const newCards = this.drawCards(roomId, 1);
    player.hand.push(...newCards);

    // Check for win condition
    if (player.position >= room.gameState.board.length) {
      room.gameState.winner = playerId;
      clearInterval(room.timerInterval);
      actionResult.message = `🎉 ${player.username} has won the game!`;
    } else {
      this.endTurn(roomId);
    }

    return actionResult;
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
        // Player chooses another player to swap with
        const otherPlayers = Object.entries(room.players)
          .filter(([id]) => id !== playerId);
        if (otherPlayers.length > 0) {
          const randomPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)][1];
          const tempPosition = player.position;
          player.position = randomPlayer.position;
          randomPlayer.position = tempPosition;
        }
        break;

      case "Shuffle Board":
        // Randomly reassign all players to new positions
        const positions = Object.values(room.players).map(p => p.position);
        positions.sort(() => Math.random() - 0.5);
        Object.values(room.players).forEach((p, i) => {
          p.position = positions[i];
        });
        break;

      case "Free Move":
        // Move forward 4 spaces without using a move card
        player.position += card.value;
        player.score += card.value;
        break;

      case "Draw 1 for Everyone":
        // Each player draws one card
        Object.keys(room.players).forEach(pid => {
          const newCards = this.drawCards(roomId, 1);
          room.players[pid].hand.push(...newCards);
        });
        break;

      case "Bonus Round":
        // Player gets 10 bonus points
        player.score += 10;
        break;

      default:
        console.log(`Unknown Event card effect: ${card.effect}`);
    }
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
    const player = room.players[playerId];
    const targetPlayer = room.players[targetPlayerId];

    if (!targetPlayer) {
      throw new Error("Target player not found");
    }

    // Debug log to see the exact card effect we're receiving
    console.log("Received card effect:", card.effect);
    console.log("Card object:", JSON.stringify(card, null, 2));

    switch (card.effect) {
      case "Discard Opponent Card":
        if (targetPlayer.hand.length > 0) {
          const discardIndex = Math.floor(Math.random() * targetPlayer.hand.length);
          targetPlayer.hand.splice(discardIndex, 1);
        }
        break;

      case "Skip Opponent Turn":
        targetPlayer.skipNextTurn = true;
        break;

      case "Steal 5 Points":
        const pointsToSteal = Math.min(5, targetPlayer.score);
        targetPlayer.score -= pointsToSteal;
        player.score += pointsToSteal;
        break;

      case "Steal a Random Card from Opponent":
        console.log("Stealing a random card from opponent gggggg");
        
        if (targetPlayer.hand.length > 0) {
          const randomIndex = Math.floor(Math.random() * targetPlayer.hand.length);
          const stolenCard = targetPlayer.hand.splice(randomIndex, 1)[0];
          player.hand.push(stolenCard);
        }
        break;

      default:
        console.log(`Unknown Mind Play card effect: ${card.effect}`);
        console.log("Available effects:", [
          "Discard Opponent Card",
          "Skip Opponent Turn",
          "Steal 5 Points",
          "Steal a Random Card from Opponent"
        ]);
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
    let nextTurnIndex = (currentTurnIndex + 1) % room.gameState.turnOrder.length;

    while (room.players[room.gameState.turnOrder[nextTurnIndex]].isBlocked) {
      const blockedPlayerId = room.gameState.turnOrder[nextTurnIndex];
      room.players[blockedPlayerId].isBlocked = false; // Reset the block
      nextTurnIndex = (nextTurnIndex + 1) % room.gameState.turnOrder.length;
      console.log(`${blockedPlayerId} was skipped because they were blocked.`);
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
}

module.exports = SurvivalPathGame;