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
    this.BOARD_SIZE = 45;
    this.BOARD_COLUMNS = 9;
    this.MAX_PLAYERS = 6;
    this.publicRooms = new Set();
    this.roomPasswords = new Map();
    this.aiPlayers = new Map();
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
    const board = Array.from({ length: this.BOARD_SIZE }, (_, i) => i + 1);
    return {
      players: {},
      board,
      cardDeck: this.shuffleDeck([...this.cards]),
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
  createRoom(roomId, isPublic = false, password = null) {
    if (this.rooms[roomId]) {
      throw new Error(`Room with ID ${roomId} already exists.`);
    }
    
    this.rooms[roomId] = {
      gameState: this.setup(),
      players: {},
      timerInterval: null,
      roundInterval: null,
      isPublic,
      hasStarted: false,
      hostId: null,
      disconnectedPlayers: new Set(),
    };

    if (isPublic) {
      this.publicRooms.add(roomId);
    }
    
    if (password) {
      this.roomPasswords.set(roomId, password);
    }
    
    console.log(`Room ${roomId} created. Public: ${isPublic}`);
  }

  /**
   * Adds a player to a room.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   * @param {string} username - The player's username.
   */
  addPlayerToRoom(roomId, playerId, username, password = null) {
    const room = this.rooms[roomId];
    
    if (!room) {
      throw new Error(`Room with ID ${roomId} does not exist.`);
    }

    if (room.hasStarted) {
      throw new Error("Game has already started");
    }

    if (Object.keys(room.players).length >= this.MAX_PLAYERS) {
      throw new Error("Room is full");
    }

    if (this.roomPasswords.has(roomId) && password !== this.roomPasswords.get(roomId)) {
      throw new Error("Invalid room password");
    }

    // Set first player as host
    if (Object.keys(room.players).length === 0) {
      room.hostId = playerId;
    }

    const newPlayer = {
      username: username || `Player ${Object.keys(room.players).length + 1}`,
      position: room.gameState.board[0],
      moves: 0,
      score: 0,
      hand: this.drawCards(roomId, 3),
      roundWins: 0,
      isHost: room.hostId === playerId,
    };

    room.players[playerId] = newPlayer;
    room.gameState.turnOrder.push(playerId);

    if (room.gameState.turnOrder.length === 1) {
      room.gameState.currentTurn = playerId;
    }
  }

  /**
   * Handles playing a card.
   * @param {string} roomId - The room ID.
   * @param {string} playerId - The player ID.
   * @param {number} cardIndex - The index of the card to play.
   * @param {string} [targetPlayerId] - The targeted player's ID (if applicable).
   * @param {string} [direction] - The direction of movement (forward or backward).
   * @returns {Object} Result of the card play.
   */
  playCard(roomId, playerId, cardIndex, targetPlayerId = null, direction = 'forward') {
    const room = this.rooms[roomId];
    if (!room) throw new Error(`Room with ID ${roomId} does not exist.`);
    if (!room.gameState.gameStarted) throw new Error(`Game has not started yet.`);

    const player = room.players[playerId];
    if (!player) throw new Error(`Player with ID ${playerId} not found in room ${roomId}.`);
    if (player.hand.length <= cardIndex || cardIndex < 0) throw new Error(`Invalid card index.`);

    if (room.gameState.currentTurn !== playerId) throw new Error(`It's not your turn.`);
    if (room.gameState.winner) throw new Error(`Game has already ended.`);

    const card = player.hand[cardIndex];
    if (!card) throw new Error(`Invalid card index.`);

    // Validate target player for Mind Play and Swap Places
    if ((card.type === "Mind Play" || (card.type === "Event" && card.effect === "Swap Places")) 
        && (!targetPlayerId || !room.players[targetPlayerId])) {
      throw new Error("Must select a valid target player");
    }

    // Handle movement
    if (card.type === "Move") {
      const movement = direction === 'forward' ? card.value : -card.value;
      const currentPosition = player.position;
      const currentIndex = room.gameState.board.indexOf(currentPosition);
      
      // Calculate new index
      let newIndex;
      if (direction === 'forward') {
        newIndex = Math.min(this.BOARD_SIZE - 1, currentIndex + movement);
      } else {
        newIndex = Math.max(0, currentIndex - card.value);
      }

      // Set position to the square number at the new index
      player.position = room.gameState.board[newIndex];
      player.moves += Math.abs(movement);
      player.score += Math.abs(movement);

      // Check for win
      if (player.position === this.BOARD_SIZE) {
        this.endRound(roomId);
        return { message: `${player.username} has won round ${room.gameState.currentRound}!` };
      }
    } 
    // Handle other card types
    else if (card.type === "Event") {
      this.handleEventCard(roomId, playerId, card, targetPlayerId);
    } else if (card.type === "Mind Play") {
      this.handleMindPlayCard(roomId, playerId, targetPlayerId, card);
    }

    // Remove played card and draw new one
    player.hand.splice(cardIndex, 1);
    const newCards = this.drawCards(roomId, 1);
    player.hand.push(...newCards);

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
  handleEventCard(roomId, playerId, card, targetPlayerId) {
    const room = this.rooms[roomId];
    const player = room.players[playerId];

    if (!room || !player) throw new Error("Invalid room or player");
    if (!card || !card.effect) throw new Error("Invalid card data");

    switch (card.effect) {
      case "Swap Places":
        if (!targetPlayerId || !room.players[targetPlayerId]) {
          throw new Error("Must select a valid target player for Swap Places");
        }
        if (targetPlayerId === playerId) {
          throw new Error("Cannot swap places with yourself");
        }
        const targetPlayer = room.players[targetPlayerId];
        const tempPosition = player.position;
        player.position = targetPlayer.position;
        targetPlayer.position = tempPosition;
        break;
      case "Shuffle Board":
        this.shuffleBoard(roomId);
        break;
      case "Free Move":
        player.position += card.value;
        player.score += card.value;
        break;
      case "Draw 1 for Everyone":
        this.drawForEveryone(roomId);
        break;
      case "Bonus Round":
        player.score += 10;
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

    // Store current player positions and their corresponding board values
    const playerPositions = {};
    Object.entries(room.players).forEach(([playerId, player]) => {
      playerPositions[playerId] = player.position;
    });

    // Shuffle the board
    room.gameState.board = this.shuffleDeck([...room.gameState.board]);

    // Update player positions based on new board positions
    Object.entries(playerPositions).forEach(([playerId, squareNumber]) => {
      // Find the new index of the player's square number
      const newIndex = room.gameState.board.indexOf(squareNumber);
      if (newIndex === -1) {
        console.error(`Square number ${squareNumber} not found after shuffle`);
        room.players[playerId].position = room.gameState.board[0];
      } else {
        room.players[playerId].position = squareNumber;
      }
    });

    console.log("Board shuffled, player positions updated");
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
    if (!room || !room.players[playerId]) throw new Error("Invalid room or player");
    if (!targetPlayerId || !room.players[targetPlayerId]) throw new Error("Invalid target player");
    if (targetPlayerId === playerId) throw new Error("Cannot target yourself");
    if (!card || !card.effect) throw new Error("Invalid card data");

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
        if (targetPlayer.score <= 0) throw new Error("Target player has no points to steal");
        const stolenPoints = Math.min(targetPlayer.score, card.value);
        targetPlayer.score -= stolenPoints;
        room.players[playerId].score += stolenPoints;
        console.log(`${playerId} stole ${stolenPoints} points from ${targetPlayer.username}.`);
        break;

      case "Steal A Random Card From Opponent":
        if (targetPlayer.hand.length === 0) throw new Error("Target player has no cards to steal");
        const randomIndex = Math.floor(Math.random() * targetPlayer.hand.length);
        const stolenCard = targetPlayer.hand.splice(randomIndex, 1)[0];
        room.players[playerId].hand.push(stolenCard);
        console.log(`${playerId} stole a random card from ${targetPlayer.username}.`);
        break;

      default:
        
        console.log("Loaded card effects:", this.cards.map(card => console.log(card)));
        console.log(`Unknown Mind Play card effect: ${card.effect}`);
    }
  }

  /**
   * Resets and starts the turn timer for a room.
   * @param {string} roomId - The room ID.
   * @param {Object} io - The socket.io instance.
   */
  resetAndStartTimer(roomId, io) {
    const room = this.rooms[roomId];
    if (!room) return;

    // Clear any existing timer
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }

    // Reset timer value
    room.gameState.timer = 30;

    // Start new timer
    room.timerInterval = setInterval(() => {
      room.gameState.timer--;
      
      // Emit timer update to all players in the room
      io.to(roomId).emit("gameState", {
        ...this.getGameState(roomId),
        timer: room.gameState.timer
      });

      if (room.gameState.timer <= 0) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
        this.endTurn(roomId);
        io.to(roomId).emit("timerExpired");
        io.to(roomId).emit("gameState", this.getGameState(roomId));
        this.resetAndStartTimer(roomId, io); // Start timer for next turn
      }
    }, 1000);
  }

  /**
   * Starts the turn timer for a room.
   * @param {string} roomId - The room ID.
   * @param {Object} io - The socket.io instance.
   */
  startTimer(roomId, io) {
    this.resetAndStartTimer(roomId, io);
  }

  /**
   * Ends the current turn and moves to the next.
   * @param {string} roomId - The room ID.
   */
  endTurn(roomId) {
    const room = this.rooms[roomId];
    if (!room) return;

    // Clear existing timer if any
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }

    // Clean up turnOrder to only include existing players
    room.gameState.turnOrder = room.gameState.turnOrder.filter(playerId => 
      room.players[playerId] !== undefined
    );

    // If no players left, return
    if (room.gameState.turnOrder.length === 0) return;

    const currentTurnIndex = room.gameState.turnOrder.indexOf(room.gameState.currentTurn);
    let nextTurnIndex = (currentTurnIndex + 1) % room.gameState.turnOrder.length;

    // Find next valid player
    let nextPlayerId = room.gameState.turnOrder[nextTurnIndex];
    
    // Check if player exists and is blocked
    while (room.players[nextPlayerId]?.isBlocked) {
      room.players[nextPlayerId].isBlocked = false;
      console.log(`${nextPlayerId}'s turn was skipped due to being blocked.`);
      nextTurnIndex = (nextTurnIndex + 1) % room.gameState.turnOrder.length;
      nextPlayerId = room.gameState.turnOrder[nextTurnIndex];
    }

    room.gameState.currentTurn = nextPlayerId;
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
      player.position = room.gameState.board[0];
      player.moves = 0;
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

  startGame(roomId) {
    const room = this.rooms[roomId];
    if (!room) return;

    if (Object.keys(room.players).length < this.MIN_PLAYERS) {
      throw new Error("Not enough players to start");
    }

    room.hasStarted = true;
    room.gameState.gameStarted = true;
    this.startRound(roomId);
  }

  handleDisconnectedPlayer(roomId, playerId) {
    const room = this.rooms[roomId];
    if (!room) return;

    if (room.hasStarted) {
      room.disconnectedPlayers.add(playerId);
      this.aiPlayers.set(playerId, {
        strategy: "random",
        originalPlayer: room.players[playerId]
      });
    } else {
      delete room.players[playerId];
      const turnOrderIndex = room.gameState.turnOrder.indexOf(playerId);
      if (turnOrderIndex > -1) {
        room.gameState.turnOrder.splice(turnOrderIndex, 1);
      }
    }
  }

  playAITurn(roomId, playerId) {
    const room = this.rooms[roomId];
    if (!room || !this.aiPlayers.has(playerId)) return;

    const player = room.players[playerId];
    if (!player || !player.hand.length) return;

    // Random card selection
    const cardIndex = Math.floor(Math.random() * player.hand.length);
    const card = player.hand[cardIndex];

    // Random target selection if needed
    let targetPlayerId = null;
    if (card.type === "Mind Play" || (card.type === "Event" && card.effect === "Swap Places")) {
      const possibleTargets = Object.keys(room.players).filter(id => id !== playerId);
      if (possibleTargets.length) {
        targetPlayerId = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
      }
    }

    // Random direction for move cards
    const direction = card.type === "Move" ? (Math.random() > 0.5 ? "forward" : "backward") : undefined;

    return this.playCard(roomId, playerId, cardIndex, targetPlayerId, direction);
  }

  getPublicRooms() {
    return Array.from(this.publicRooms)
      .filter(roomId => {
        const room = this.rooms[roomId];
        return room && !room.hasStarted && Object.keys(room.players).length < this.MAX_PLAYERS;
      })
      .map(roomId => ({
        roomId,
        playerCount: Object.keys(this.rooms[roomId].players).length,
        maxPlayers: this.MAX_PLAYERS
      }));
  }
}

module.exports = SurvivalPathGame;