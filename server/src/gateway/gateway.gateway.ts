import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from '../games/games.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class Gateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private socketRoomMap: Map<string, string> = new Map();

  constructor(private gamesService: GamesService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const roomId = this.socketRoomMap.get(client.id);
    if (roomId) {
      console.log(`Client ${client.id} disconnected from room ${roomId}`);
      this.socketRoomMap.delete(client.id);
      client.to(roomId).emit('player_disconnected', { clientId: client.id });
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    client: Socket,
    payload: { gameId: string; userId: string },
  ) {
    const { gameId, userId } = payload;
    console.log(
      `join_room: gameId=${gameId}, userId=${userId}, clientId=${client.id}`,
    );

    // 🛡️ Guard: if this socket already joined this room, skip
    if (this.socketRoomMap.get(client.id) === gameId) {
      console.log(`Client ${client.id} already in room ${gameId}, skipping`);
      return;
    }

    try {
      const game = await this.gamesService.getGame(gameId, userId);
      if (!game) {
        client.emit('error', { message: 'Game not found' });
        return;
      }

      console.log(
        `Current game: whiteId=${game.game.whiteId}, blackId=${game.game.blackId}`,
      );

      // If black is waiting and user is not already a player
      if (game.game.blackId === 'WAITING' && game.game.whiteId !== userId) {
        console.log(`Assigning user ${userId} as black`);
        await this.gamesService.assignPlayer(gameId, userId, 'black');
        const updatedGame = await this.gamesService.getGame(gameId, userId);
        console.log('Updated game after assignment:', updatedGame);

        client.join(gameId);
        this.socketRoomMap.set(client.id, gameId);
        this.server.to(gameId).emit('game_state', updatedGame);
        client.emit('player_assigned', { color: 'black' });
        return;
      }

      // If user is already a player, just join
      if (game.game.whiteId === userId || game.game.blackId === userId) {
        console.log(`User ${userId} is already a player, joining room`);
        client.join(gameId);
        this.socketRoomMap.set(client.id, gameId);
        client.emit('game_state', game);
        client
          .to(gameId)
          .emit('player_joined', { clientId: client.id, userId });
        return;
      }

      client.emit('error', { message: 'You are not a player in this game' });
    } catch (err) {
      console.error('join_room error:', err);
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('make_move')
  async handleMakeMove(client: Socket, payload: any) {
    const { gameId, userId, fromRow, fromCol, toRow, toCol } = payload;
    try {
      const result = await this.gamesService.makeMove(gameId, userId, {
        fromRow,
        fromCol,
        toRow,
        toCol,
      });
      this.server.to(gameId).emit('game_state', result);
      if (result.status !== 'ACTIVE') {
        this.server.to(gameId).emit('game_over', result);
      }
    } catch (err) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('chat_message')
  handleChatMessage(
    client: Socket,
    payload: {
      gameId: string;
      userId: string;
      username: string;
      message: string;
    },
  ) {
    const { gameId, userId, username, message } = payload;
    this.server
      .to(gameId)
      .emit('chat_message', {
        userId,
        username,
        message,
        timestamp: new Date(),
      });
  }

  @SubscribeMessage('voice_message')
  handleVoiceMessage(
    client: Socket,
    payload: {
      gameId: string;
      userId: string;
      username: string;
      audio: string;
    },
  ) {
    const { gameId, userId, username, audio } = payload;
    this.server
      .to(gameId)
      .emit('voice_message', {
        userId,
        username,
        audio,
        timestamp: new Date(),
      });
  }
}
