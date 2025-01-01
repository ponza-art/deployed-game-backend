const SurvivalPathGame = require("./gameLogic");

const game = new SurvivalPathGame();

function handleSocketConnection(io) {
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on("createRoom", ({ roomId, isPublic, password }) => {
      try {
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        
        game.createRoom(roomId, isPublic, password);
        socket.join(roomId);
        io.emit("publicRoomsUpdate", game.getPublicRooms());
        
      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("joinRoom", ({ roomId, username, password }) => {
      try {
        game.addPlayerToRoom(roomId, socket.id, username, password);
        socket.join(roomId);
        io.to(roomId).emit("gameState", game.getGameState(roomId));
        io.emit("publicRoomsUpdate", game.getPublicRooms());
      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("startGame", (roomId) => {
      try {
        const room = game.rooms[roomId];
        if (!room || room.hostId !== socket.id) {
          throw new Error("Only the host can start the game");
        }
        
        game.startGame(roomId);
        game.startTimer(roomId, io);
        io.to(roomId).emit("gameState", game.getGameState(roomId));
        io.emit("publicRoomsUpdate", game.getPublicRooms());
      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("getPublicRooms", () => {
      socket.emit("publicRoomsUpdate", game.getPublicRooms());
    });

    socket.on("quickJoin", () => {
      try {
        const publicRooms = game.getPublicRooms();
        const availableRoom = publicRooms.find(room => 
          !game.rooms[room.roomId].hasStarted && 
          room.playerCount < game.MAX_PLAYERS
        );

        if (!availableRoom) {
          throw new Error("No available rooms found");
        }

        socket.emit("quickJoinRoom", availableRoom.roomId);
      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("playCard", ({ roomId, cardIndex, targetPlayerId, direction }) => {
      try {
        // Validate inputs
        if (!roomId || typeof roomId !== 'string') {
          throw new Error('Invalid room ID');
        }
        if (typeof cardIndex !== 'number' || cardIndex < 0) {
          throw new Error('Invalid card index');
        }
        if (direction && !['forward', 'backward'].includes(direction)) {
          throw new Error('Invalid direction');
        }

        // Check if game is in valid state
        const room = game.rooms[roomId];
        if (!room) {
          throw new Error('Room does not exist');
        }
        if (!room.gameState.gameStarted) {
          throw new Error('Game has not started');
        }
        if (room.gameState.winner) {
          throw new Error('Game has ended');
        }

        const result = game.playCard(roomId, socket.id, cardIndex, targetPlayerId, direction);
        const roomState = game.getGameState(roomId);

        // Check if the round should end due to player position
        const currentPlayer = roomState.players[socket.id];
        if (currentPlayer && currentPlayer.position >= 45) {
          game.endRound(roomId);
          io.to(roomId).emit("roundEnd", {
            winner: socket.id,
            winnerName: currentPlayer.username
          });
        }

        // Add additional context for event and mind play cards
        let eventDetails = null;
        const playedCard = roomState.players[socket.id]?.hand[cardIndex];

        if (playedCard?.type === "Event") {
          switch (playedCard.effect) {
            case "Swap Places":
              const targetPlayer = roomState.players[targetPlayerId]?.username || targetPlayerId;
              eventDetails = `Player ${socket.id} swapped places with ${targetPlayer}.`;
              break;
            case "Shuffle Board":
              eventDetails = "The board positions were shuffled.";
              break;
            case "Free Move":
              eventDetails = `Player ${socket.id} moved ${playedCard.value} steps for free.`;
              break;
            case "Draw 1 for Everyone":
              eventDetails = "Each player drew 1 card.";
              break;
            case "Bonus Round":
              eventDetails = `Player ${socket.id} earned a bonus round!`;
              break;
          }
        } else if (playedCard?.type === "Mind Play") {
          eventDetails = `Player ${socket.id} played a Mind Play card targeting ${targetPlayerId}!`;
        } else if (playedCard?.type === "Move") {
          eventDetails = `Player ${socket.id} moved ${playedCard.value} steps ${direction}.`;
        }

        // Reset and restart timer only if game is still active
        if (!roomState.gameState.winner) {
          game.resetAndStartTimer(roomId, io);
        }

        io.to(roomId).emit("gameState", {
          ...roomState,
          lastAction: result.message,
          eventDetails,
        });

      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("disconnect", () => {
      try {
        console.log(`Player disconnected: ${socket.id}`);
        
        // Find all rooms the player was in
        for (const roomId in game.rooms) {
          const room = game.rooms[roomId];
          if (room?.players[socket.id]) {
            // Instead of removing player, mark them as AI-controlled
            game.handleDisconnectedPlayer(roomId, socket.id);

            // If it was this player's turn, move to next player
            if (room.gameState.currentTurn === socket.id) {
              game.endTurn(roomId);
            }

            io.to(roomId).emit("playerDisconnected", socket.id);
            io.to(roomId).emit("gameState", game.getGameState(roomId));
          }
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
}

module.exports = handleSocketConnection;