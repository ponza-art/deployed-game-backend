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

    socket.on("playCard", ({ roomId, cardIndex, targetPlayerId }) => {
        try {
          // Handle playing a card
          const result = game.playCard(roomId, socket.id, cardIndex, targetPlayerId);
          const roomState = game.getGameState(roomId);
      
          // Add additional context for event and mind play cards
          let eventDetails = null;
          const playedCard = roomState.players[socket.id]?.hand[cardIndex];
      
          if (playedCard?.type === "Event") {
            switch (playedCard.effect) {
              case "Swap Places":
                eventDetails = `Player ${socket.id} swapped places with another player.`;
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
          }
      
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
        if (game.rooms[roomId]?.players[socket.id]) {
          delete game.rooms[roomId].players[socket.id];
          io.to(roomId).emit("gameState", game.getGameState(roomId));
        }
      }
    });
  });
}

module.exports = handleSocketConnection;
