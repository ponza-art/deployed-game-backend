const { log } = require("console");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

class SurvivalPathGame {
  constructor() {
    this.rooms = {};
    this.defaultCards = this.initializeCards();
  }

  initializeCards() {
    const cards = [
      ...Array(5).fill({ type: "Move", value: 1 }),
      ...Array(5).fill({ type: "Move", value: 2 }),
      ...Array(4).fill({ type: "Move", value: 3 }),
      ...Array(3).fill({ type: "Move", value: 4 }),
      ...Array(3).fill({ type: "Move", value: 5 }),

      { type: "Penalty", effect: "Step Back", value: -2 },
      { type: "Penalty", effect: "Lose Points", value: -10 },
      { type: "Penalty", effect: "Skip Turn" },
      { type: "Penalty", effect: "Reverse Movement" },
      { type: "Penalty", effect: "Force Discard" },

      { type: "Bonus", effect: "Gain Points", value: 10 },
      { type: "Bonus", effect: "Extra Move", value: 2 },
      { type: "Bonus", effect: "Draw Cards", value: 2 },
      { type: "Bonus", effect: "Double Move" },
      { type: "Bonus", effect: "Give Card", value: 1 },

      { type: "Event", effect: "Swap Places" },
      { type: "Event", effect: "Shuffle Board" },
      { type: "Event", effect: "Free Move", value: 4 },
      { type: "Event", effect: "Draw Card for Everyone" },
      { type: "Event", effect: "Bonus Round" },

      { type: "Mind Play", effect: "Discard Opponent Card" },
      { type: "Mind Play", effect: "Skip Opponent Turn" },
      { type: "Mind Play", effect: "Steal Points", value: 5 },
      { type: "Mind Play", effect: "Block Move" },
    ];
    return this.shuffleCards(cards);
  }

  shuffleCards(cards) {
    return cards.sort(() => Math.random() - 0.5);
  }

  createRoom(roomId) {
    if (!this.rooms[roomId]) {
      this.rooms[roomId] = {
        players: {},
        board: Array(20).fill(null),
        currentTurn: null,
        cardDeck: [...this.defaultCards],
      };
      log(`Room ${roomId} created.`);
    }
  }

  addPlayerToRoom(roomId, playerId, username) {
    const room = this.rooms[roomId];
    if (room && !room.players[playerId]) {
      room.players[playerId] = {
        username: username || `Player ${Object.keys(room.players).length + 1}`,
        position: 0,
        points: 0,
        hand: this.drawInitialCards(room),
        skipped: false,
        reverse: false,
      };

      if (!room.currentTurn) room.currentTurn = playerId;
      log(`${username || `Player ${Object.keys(room.players).length}`} joined room ${roomId}.`);
    }
  }

  drawInitialCards(room) {
    return [this.drawCard(room), this.drawCard(room), this.drawCard(room)];
  }

  drawCard(room) {
    if (room.cardDeck.length === 0) {
      room.cardDeck = [...this.shuffleCards(this.defaultCards)];
      log(`Deck reshuffled for room ${room}.`);
    }
    return room.cardDeck.pop();
  }

  playCard(roomId, playerId, card, targetId = null) {
    const room = this.rooms[roomId];
    const player = room?.players[playerId];
    const targetPlayer = targetId ? room?.players[targetId] : null;

    if (!room || !player) return { error: "Invalid room or player." };
    if (room.currentTurn !== playerId) return { error: "Not your turn!" };

    if (player.skipped) {
        player.skipped = false;
        this.updateTurn(roomId);
        return { message: "Turn skipped due to penalty!" };
    }

    let pointsGained = 0;
    let actionMessage = `${player.username} played ${card.effect}`;

    // Game logic
    switch (card.type) {
        case "Move":
            player.position = Math.min(20, player.position + card.value);
            pointsGained = card.value;
            actionMessage += ` and moved forward ${card.value} steps.`;
            break;
        case "Penalty":
            switch (card.effect) {
                case "Step Back":
                    player.position = Math.max(0, player.position + card.value);
                    actionMessage += ` and stepped back ${-card.value} steps.`;
                    break;
                case "Lose Points":
                    player.points += card.value;
                    actionMessage += ` and lost ${-card.value} points.`;
                    break;
                case "Skip Turn":
                    player.skipped = true;
                    actionMessage += ` and will skip their next turn.`;
                    break;
                case "Reverse Movement":
                    player.reverse = !player.reverse;
                    actionMessage += ` and reversed their movement.`;
                    break;
            }
            break;
        case "Bonus":
            switch (card.effect) {
                case "Gain Points":
                    player.points += card.value;
                    actionMessage += ` and gained ${card.value} points.`;
                    break;
                case "Extra Move":
                    player.position = Math.min(20, player.position + card.value);
                    pointsGained = card.value;
                    actionMessage += ` and moved ${card.value} extra steps.`;
                    break;
                case "Draw Cards":
                    player.hand.push(this.drawCard(room), this.drawCard(room));
                    actionMessage += ` and drew 2 extra cards.`;
                    break;
            }
            break;
        case "Event":
            switch (card.effect) {
                case "Swap Places":
                    if (targetPlayer) {
                        const temp = player.position;
                        player.position = targetPlayer.position;
                        targetPlayer.position = temp;
                        actionMessage += ` and swapped positions with ${targetPlayer.username}.`;
                    }
                    break;
                case "Draw Card for Everyone":
                    for (const pId in room.players) {
                        room.players[pId].hand.push(this.drawCard(room));
                    }
                    actionMessage += ` and everyone drew 1 card.`;
                    break;
            }
            break;
        case "Mind Play":
            switch (card.effect) {
                case "Discard Opponent Card":
                    if (targetPlayer && targetPlayer.hand.length > 0) {
                        targetPlayer.hand.pop();
                        actionMessage += ` and made ${targetPlayer.username} discard a card.`;
                    }
                    break;
                case "Steal Points":
                    if (targetPlayer) {
                        player.points += card.value;
                        targetPlayer.points -= card.value;
                        actionMessage += ` and stole ${card.value} points from ${targetPlayer.username}.`;
                    }
                    break;
                case "Skip Opponent Turn":
                    if (targetPlayer) {
                        targetPlayer.skipped = true;
                        actionMessage += ` and skipped ${targetPlayer.username}'s next turn.`;
                    }
                    break;
            }
            break;
    }

    player.points += pointsGained;
    player.hand = player.hand.filter((c) => c !== card);
    player.hand.push(this.drawCard(room));

    if (player.position >= 20) {
        player.points += 50;
        io.to(roomId).emit("gameState", game.getGameState(roomId));
        return { winner: player.username, points: player.points };
    }

    this.updateTurn(roomId);
    return { success: true, message: actionMessage };
}

updateTurn(roomId) {
    const room = this.rooms[roomId];
    if (!room || Object.keys(room.players).length === 0) return;
  
    const playerIds = Object.keys(room.players);
    if (playerIds.length === 1) {
      room.currentTurn = playerIds[0];
      return; // Only one player, keep their turn
    }
  
    let currentIndex = playerIds.indexOf(room.currentTurn);
    let nextTurnAssigned = false;
  
    for (let i = 0; i < playerIds.length; i++) {
      currentIndex = (currentIndex + 1) % playerIds.length; // Move to the next player in a circular manner
      const nextPlayer = room.players[playerIds[currentIndex]];
  
      if (!nextPlayer.skipped) {
        room.currentTurn = playerIds[currentIndex];
        nextTurnAssigned = true;
        break;
      } else {
        nextPlayer.skipped = false; // Reset skipped status for the next round
      }
    }
  
    // Fallback: If no eligible player is found, default to the first player
    if (!nextTurnAssigned) {
      room.currentTurn = playerIds[0];
    }
  }
  

  removeEmptyRooms() {
    for (const roomId in this.rooms) {
      if (Object.keys(this.rooms[roomId].players).length === 0) {
        delete this.rooms[roomId];
        log(`Room ${roomId} removed due to inactivity.`);
      }
    }
  }

  getGameState(roomId) {
    return this.rooms[roomId];
  }
}

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const game = new SurvivalPathGame();

io.on("connection", (socket) => {
  socket.on("createRoom", (roomId) => {
    game.createRoom(roomId);
    socket.join(roomId);
    io.to(roomId).emit("gameState", game.getGameState(roomId));
  });

  socket.on("joinRoom", ({ roomId, username }) => {
    game.addPlayerToRoom(roomId, socket.id, username);
    socket.join(roomId);
    io.to(roomId).emit("gameState", game.getGameState(roomId));
  });

  socket.on("playCard", ({ roomId, card, targetId }) => {
    const result = game.playCard(roomId, socket.id, card, targetId);
    if (result.error) {
        socket.emit("actionError", result.error);
    } else {
        io.to(roomId).emit("gameState", { ...game.getGameState(roomId), lastAction: result.message });
    }
});


  socket.on("disconnect", () => {
    for (const roomId in game.rooms) {
      if (game.rooms[roomId]?.players[socket.id]) {
        delete game.rooms[roomId].players[socket.id];
        game.removeEmptyRooms();
        io.to(roomId).emit("gameState", game.getGameState(roomId));
        log(`Player ${socket.id} disconnected from room ${roomId}.`);
      }
    }
  });
});

httpServer.listen(8000, () =>
  log("Server running on http://localhost:8000")

); 