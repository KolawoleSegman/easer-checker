import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { statistics, games, users } from '../db/schema';
import { eq, desc, or, ne, like, and } from 'drizzle-orm';

@Injectable()
export class UsersService {
  async getStats(userId: string) {
    const result = await db
      .select()
      .from(statistics)
      .where(eq(statistics.userId, userId));
    if (result.length === 0) {
      return { wins: 0, losses: 0, draws: 0, totalMoves: 0, maxWinStreak: 0 };
    }
    const { wins, losses, draws, totalMoves, maxWinStreak } = result[0];
    return { wins, losses, draws, totalMoves, maxWinStreak };
  }

  /**
   * Returns games the user has played as EITHER color (previously this only
   * looked at whiteId, so any game where the user played black — including
   * every multiplayer game they joined as the second player — silently
   * never showed up in "Recent Games" or the "Continue" list).
   */
  async getRecentGames(userId: string, limit: number = 10) {
    const rows = await db
      .select()
      .from(games)
      .where(or(eq(games.whiteId, userId), eq(games.blackId, userId)))
      .orderBy(desc(games.startedAt))
      .limit(limit);

    const opponentIds = Array.from(
      new Set(
        rows
          .map((g) => (g.whiteId === userId ? g.blackId : g.whiteId))
          .filter((id) => id && id !== 'AI' && id !== 'WAITING'),
      ),
    );

    const opponentRows = opponentIds.length
      ? await db.select().from(users)
      : [];
    const opponentMap = new Map(opponentRows.map((u) => [u.id, u]));

    return rows.map((g) => {
      const isWhite = g.whiteId === userId;
      const myColor = isWhite ? 'white' : 'black';
      const opponentId = isWhite ? g.blackId : g.whiteId;

      let opponentUsername = 'Unknown';
      let opponentAvatar = '';
      if (opponentId === 'AI') opponentUsername = 'AI';
      else if (opponentId === 'WAITING') opponentUsername = 'Waiting for opponent';
      else {
        const opp = opponentMap.get(opponentId);
        if (opp) {
          opponentUsername = opp.username;
          opponentAvatar = opp.avatar || '';
        }
      }

      let result: 'WIN' | 'LOSS' | 'DRAW' | 'ONGOING' = 'ONGOING';
      if (g.status === 'ACTIVE') result = 'ONGOING';
      else if (g.status === 'DRAW') result = 'DRAW';
      else if (g.winnerId === userId) result = 'WIN';
      else if (g.status === 'WHITE_WINS' || g.status === 'BLACK_WINS')
        result = 'LOSS';

      return {
        id: g.id,
        status: g.status,
        myColor,
        opponentUsername,
        opponentAvatar,
        isAI: g.blackId === 'AI',
        difficulty: g.aiDifficulty,
        result,
        startedAt: g.startedAt,
        endedAt: g.endedAt,
      };
    });
  }

  async searchUsers(query: string, excludeUserId: string) {
    if (!query || query.trim().length === 0) return [];
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        eloRating: users.eloRating,
      })
      .from(users)
      .where(
        and(like(users.username, `%${query.trim()}%`), ne(users.id, excludeUserId)),
      )
      .limit(20);
    return rows;
  }
}
