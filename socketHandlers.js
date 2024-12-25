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
          const result = game.playCard(roomId, socket.id, cardIndex, targetPlayerId);
          const roomState = game.getGameState(roomId);
          const player = roomState.players[socket.id];
          
          let eventDetails = null;
          const playedCard = result.playedCard;
          const targetPlayer = targetPlayerId ? roomState.players[targetPlayerId] : null;

          switch (playedCard.type) {
            case "Move":
              eventDetails = `${player.username} moved ${playedCard.value} steps forward`;
              break;

            case "Event":
              switch (playedCard.effect) {
                case "Swap Places":
                  eventDetails = `${player.username} swapped positions with another player`;
                  break;
                case "Shuffle Board":
                  eventDetails = "All players' positions were shuffled";
                  break;
                case "Free Move":
                  eventDetails = `${player.username} moved ${playedCard.value} steps for free`;
                  break;
                case "Draw 1 for Everyone":
                  eventDetails = "Every player drew a card";
                  break;
                case "Bonus Round":
                  eventDetails = `${player.username} gained 10 bonus points`;
                  break;
              }
              break;

            case "Mind Play":
              switch (playedCard.effect) {
                case "Discard Opponent Card":
                  eventDetails = `${player.username} made ${targetPlayer.username} discard a card`;
                  break;
                case "Skip Opponent Turn":
                  eventDetails = `${player.username} made ${targetPlayer.username} skip their next turn`;
                  break;
                case "Steal 5 Points":
                  eventDetails = `${player.username} stole up to 5 points from ${targetPlayer.username}`;
                  break;
                case "Steal a Random Card from Opponent":
                  eventDetails = `${player.username} stole a random card from ${targetPlayer.username}`;
                  break;
              }
              break;
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
