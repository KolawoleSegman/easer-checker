import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { GamesService } from '../games/games.service';
import { JWT_SECRET } from '../auth/constants';
import { getUserInfo } from '../common/user-cache';

interface SocketData {
  userId: string;
  username: string;
  roomId?: string;
}

const MAX_CHAT_LENGTH = 500;
const MAX_VOICE_LENGTH = 2_500_000; // ~1.8MB of audio once base64-encoded

const configuredSocketOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const socketAllowedOrigins = configuredSocketOrigins.length
  ? configuredSocketOrigins
  : process.env.NODE_ENV === 'production' || process.env.RENDER
    ? []
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

@WebSocketGateway({
  cors: { origin: socketAllowedOrigins, credentials: true },
  maxHttpBufferSize: 3_000_000, // voice notes are sent as base64
  pingInterval: 10_000,
  pingTimeout: 15_000,
})
export class Gateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private gamesService: GamesService) {
    // Any committed move (from REST or from a socket) is pushed to the room.
    this.gamesService.onStateChanged((gameId, state) => {
      if (!this.server) return;
      this.server.to(gameId).emit('game_state', state);
      if (state.status !== 'ACTIVE') {
        this.server.to(gameId).emit('game_over', state);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Connection lifecycle — every socket is authenticated with the same JWT
  // the REST API uses. Previously the server trusted whatever `userId` the
  // client put in each message, so anyone could move for anyone.
  // ---------------------------------------------------------------------
  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth as any)?.token ||
        (client.handshake.query as any)?.token;
      if (!token) throw new Error('missing token');
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      const info = getUserInfo(payload.sub);
      if (!info) throw new Error('unknown user');
      (client.data as SocketData).userId = payload.sub;
      (client.data as SocketData).username = info.username;
    } catch {
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as SocketData;
    const roomId = data?.roomId;
    if (roomId) {
      client.to(roomId).emit('player_disconnected', { userId: data.userId });
      this.emitPlayerCount(roomId);
    }
  }

  private emitPlayerCount(roomId: string) {
    const room = this.server.sockets.adapter.rooms.get(roomId);
    this.server.to(roomId).emit('player_count', { count: room ? room.size : 0 });
  }

  private errorMessage(err: any): string {
    const res = err?.response;
    if (res && typeof res.message === 'string') return res.message;
    if (res && Array.isArray(res.message)) return res.message.join(', ');
    return err?.message || 'Unknown error';
  }

  // ---------------------------------------------------------------------
  // Rooms
  // ---------------------------------------------------------------------
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { gameId: string },
  ) {
    const data = client.data as SocketData;
    const gameId = payload?.gameId;
    if (!data?.userId || !gameId) return { error: 'Invalid request' };

    try {
      // Moving to a different game: leave the previous room first.
      if (data.roomId && data.roomId !== gameId) {
        const old = data.roomId;
        client.leave(old);
        data.roomId = undefined;
        client.to(old).emit('player_disconnected', { userId: data.userId });
        this.emitPlayerCount(old);
      }

      const { joined, state } = await this.gamesService.joinGame(
        gameId,
        data.userId,
      );

      const alreadyHere = client.rooms.has(gameId);
      client.join(gameId);
      data.roomId = gameId;

      if (joined) {
        // New second player: tell everyone in the room the game is on.
        this.server.to(gameId).emit('game_state', state);
        client.emit('player_assigned', { color: 'black' });
        this.server.to(gameId).emit('game_start', {
          message: 'Both players are ready!',
        });
        client.to(gameId).emit('player_joined', {
          userId: data.userId,
          message: 'A new player has joined!',
        });
      } else {
        client.emit('game_state', state);
        if (!alreadyHere) {
          client.to(gameId).emit('player_joined', { userId: data.userId });
        }
        if (
          state.game.whiteId !== 'WAITING' &&
          state.game.blackId !== 'WAITING'
        ) {
          client.emit('game_start', { message: 'Both players are ready!' });
        }
      }
      this.emitPlayerCount(gameId);
      return { ok: true };
    } catch (err) {
      const message = this.errorMessage(err);
      client.emit('error', { message });
      return { error: message };
    }
  }

  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { gameId: string },
  ) {
    const data = client.data as SocketData;
    const gameId = payload?.gameId;
    if (gameId && client.rooms.has(gameId)) {
      client.leave(gameId);
      if (data.roomId === gameId) data.roomId = undefined;
      client.to(gameId).emit('player_disconnected', { userId: data.userId });
      this.emitPlayerCount(gameId);
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // Moves — the FULL game state is broadcast to the room, so the opponent's
  // board updates instantly without any extra REST round-trip. (Before, the
  // server broadcast a partial result with no `moves`/`game`, which the
  // client threw away, so the other player never saw the move live.)
  // ---------------------------------------------------------------------
  @SubscribeMessage('make_move')
  async handleMakeMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const data = client.data as SocketData;
    const { gameId, fromRow, fromCol, toRow, toCol } = payload || {};

    if (
      !data?.userId ||
      !gameId ||
      [fromRow, fromCol, toRow, toCol].some((n) => !Number.isInteger(n))
    ) {
      return { error: 'Missing or invalid move fields' };
    }
    if (!client.rooms.has(gameId)) {
      return { error: 'Join the game room first' };
    }

    try {
      const result = await this.gamesService.makeMove(gameId, data.userId, {
        fromRow,
        fromCol,
        toRow,
        toCol,
      });
      void result; // state is broadcast by the onStateChanged listener
      return { ok: true };
    } catch (err) {
      const message = this.errorMessage(err);
      client.emit('move_error', { message });
      return { error: message };
    }
  }

  // ---------------------------------------------------------------------
  // Chat — identity comes from the authenticated socket, never the payload,
  // and only people actually in the room can post to it.
  // ---------------------------------------------------------------------
  @SubscribeMessage('chat_message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { gameId: string; message: string },
  ) {
    const data = client.data as SocketData;
    const gameId = payload?.gameId;
    const message =
      typeof payload?.message === 'string'
        ? payload.message.trim().slice(0, MAX_CHAT_LENGTH)
        : '';
    if (!data?.userId || !gameId || !message || !client.rooms.has(gameId)) {
      return { error: 'Cannot send message' };
    }
    this.server.to(gameId).emit('chat_message', {
      userId: data.userId,
      username: data.username,
      message,
      timestamp: new Date(),
    });
    return { ok: true };
  }

  @SubscribeMessage('voice_message')
  handleVoiceMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { gameId: string; audio: string },
  ) {
    const data = client.data as SocketData;
    const gameId = payload?.gameId;
    const audio = payload?.audio;
    if (
      !data?.userId ||
      !gameId ||
      typeof audio !== 'string' ||
      !audio.startsWith('data:audio') ||
      audio.length > MAX_VOICE_LENGTH ||
      !client.rooms.has(gameId)
    ) {
      return { error: 'Cannot send voice message' };
    }
    this.server.to(gameId).emit('voice_message', {
      userId: data.userId,
      username: data.username,
      audio,
      timestamp: new Date(),
    });
    return { ok: true };
  }
}
