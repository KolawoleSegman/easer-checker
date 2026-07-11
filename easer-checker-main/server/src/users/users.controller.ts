import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { db } from '../db';
import { users, statistics } from '../db/schema';
import { desc, eq } from 'drizzle-orm';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me/stats')
  async getMyStats(@Request() req) {
    const userId = req.user.userId;
    return this.usersService.getStats(userId);
  }

  @Get('me/games')
  async getMyGames(@Request() req) {
    const userId = req.user.userId;
    return this.usersService.getRecentGames(userId, 20);
  }

  @Get('search')
  async search(@Request() req, @Query('q') q: string) {
    return this.usersService.searchUsers(q, req.user.userId);
  }

  @Get('leaderboard')
  async getLeaderboard() {
    const top = await db
      .select({
        id: users.id,
        username: users.username,
        avatar: users.avatar,
        eloRating: users.eloRating,
        wins: statistics.wins,
        losses: statistics.losses,
      })
      .from(users)
      .leftJoin(statistics, eq(statistics.userId, users.id))
      .orderBy(desc(users.eloRating))
      .limit(100);
    return top;
  }
}
