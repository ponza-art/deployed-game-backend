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
        io.to(roomId).emit("gameState", game.getGameState(roomId));
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

    socket.on("playCard", ({ roomId, cardIndex }) => {
      try {
        const result = game.playCard(roomId, socket.id, cardIndex);
        io.to(roomId).emit("gameState", {
          ...game.getGameState(roomId),
          lastAction: result.message,
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
