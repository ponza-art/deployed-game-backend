const fs = require("fs");
const path = require("path");

class SurvivalPathGame {
  constructor() {
    this.name = "survival-path";
    this.rooms = {};
    this.cards = this.loadCards();
  }

  loadCards() {
    const filePath = path.resolve(__dirname, "cards.json");
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  setup() {
    return {
      players: {},
      board: Array(20).fill(null),
      cardDeck: this.shuffleDeck([...this.cards]),
      turn: 0,
      turnOrder: [],
      currentTurn: null,
      winner: null,
      timer: 30, // Timer per turn
    };
  }

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

    const card = player.hand[cardIndex];
    player.position += card.value;
    player.score += card.value * 10;

    player.hand.splice(cardIndex, 1);
    const newCards = this.drawCards(roomId, 1);
    player.hand.push(...newCards);

    if (player.position >= 20) {
      room.gameState.winner = playerId;
      clearInterval(room.timerInterval);
      return { message: `🎉 ${player.username} has won the game!` };
    }

    this.endTurn(roomId);
    return {
      message: `${player.username} moved to position ${player.position}.`,
    };
  }

  drawCards(roomId, count) {
    const room = this.rooms[roomId];
    const cards = [];
    for (let i = 0; i < count; i++) {
      if (room.gameState.cardDeck.length === 0) {
        room.gameState.cardDeck = this.shuffleDeck([...this.cards]);
      }
      cards.push(room.gameState.cardDeck.pop());
    }
    return cards;
  }

  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  startTimer(roomId, io) {
    const room = this.rooms[roomId];
    if (!room) return;

    clearInterval(room.timerInterval);
    room.gameState.timer = 30;

    room.timerInterval = setInterval(() => {
      room.gameState.timer--;
      io.to(roomId).emit("timerUpdate", { timer: room.gameState.timer });

      if (room.gameState.timer <= 0) {
        this.endTurn(roomId);
        io.to(roomId).emit("gameState", this.getGameState(roomId));
      }
    }, 1000);
  }

  endTurn(roomId) {
    const room = this.rooms[roomId];
    const currentTurnIndex = room.gameState.turnOrder.indexOf(room.gameState.currentTurn);
    const nextTurnIndex = (currentTurnIndex + 1) % room.gameState.turnOrder.length;
    room.gameState.currentTurn = room.gameState.turnOrder[nextTurnIndex];
    room.gameState.turn++;
    this.startTimer(roomId); // Restart timer for the next turn
  }

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
