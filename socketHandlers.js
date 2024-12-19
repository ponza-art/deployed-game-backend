const SurvivalPathGame = require("./gameLogic");

const game = new SurvivalPathGame();

function handleSocketConnection(io) {
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
          console.log(`Player ${socket.id} disconnected from room ${roomId}.`);
        }
      }
    });
  });
}

module.exports = handleSocketConnection;
