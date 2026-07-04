import { Injectable } from '@nestjs/common';
import { db } from '../db';
import { statistics, games } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

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

  async getRecentGames(userId: string, limit: number = 10) {
    return db
      .select()
      .from(games)
      .where(eq(games.whiteId, userId))
      .orderBy(desc(games.startedAt))
      .limit(limit);
  }
}
