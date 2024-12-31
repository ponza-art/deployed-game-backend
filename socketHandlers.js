const SurvivalPathGame = require("./gameLogic");

const game = new SurvivalPathGame();

function handleSocketConnection(io) {
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on("createRoom", (roomId) => {
      try {
        game.createRoom(roomId);
        socket.join(roomId);
        game.startTimer(roomId, io);
        io.to(roomId).emit("gameState", game.getGameState(roomId)); // Includes the board
      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("joinRoom", ({ roomId, username }) => {
      try {
        game.addPlayerToRoom(roomId, socket.id, username);
        socket.join(roomId);
        io.to(roomId).emit("gameState", game.getGameState(roomId));
      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });

    socket.on("playCard", ({ roomId, cardIndex, targetPlayerId, direction }) => {
      try {
        const result = game.playCard(roomId, socket.id, cardIndex, targetPlayerId, direction);
        const roomState = game.getGameState(roomId);

        // Emit game log message
        io.to(roomId).emit("gameLog", { message: result.message });

        // Handle round/game completion
        if (result.roundComplete) {
          const winner = roomState.players[result.roundWinner];
          io.to(roomId).emit("roundComplete", {
            winner: winner.username,
            round: roomState.gameState.currentRound,
            score: winner.score
          });
          io.to(roomId).emit("gameLog", { message: `Round ${roomState.gameState.currentRound} complete! ${winner.username} wins with ${winner.score} points!` });
        }

        if (result.gameComplete) {
          const winner = roomState.players[result.gameWinner];
          io.to(roomId).emit("gameComplete", {
            winner: winner.username,
            score: winner.score
          });
          io.to(roomId).emit("gameLog", { message: `Game complete! ${winner.username} wins with ${winner.score} points!` });
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

        // Reset and restart timer for next turn
        game.resetAndStartTimer(roomId, io);

        // Emit game state with last action and event details
        io.to(roomId).emit("gameState", {
          ...game.getGameState(roomId),
          lastAction: result.message,
          eventDetails,
        });

      } catch (error) {
        socket.emit("actionError", { message: error.message });
      }
    });
          

    socket.on("disconnect", () => {
      console.log(`Player disconnected: ${socket.id}`);
      for (const roomId in game.rooms) {
        const room = game.rooms[roomId];
        if (room?.players[socket.id]) {
          const username = room.players[socket.id].username;
          delete room.players[socket.id];
          
          // Remove from turn order
          room.gameState.turnOrder = room.gameState.turnOrder.filter(id => id !== socket.id);
          
          // If not enough players, end the game
          if (Object.keys(room.players).length < game.MIN_PLAYERS) {
            io.to(roomId).emit("gameInterrupted", {
              message: "Not enough players to continue"
            });
            game.endGame(roomId, io);
          }
          
          io.to(roomId).emit("playerLeft", { username });
          io.to(roomId).emit("gameState", game.getGameState(roomId));
        }
      }
    });
  });
}

module.exports = handleSocketConnection;
