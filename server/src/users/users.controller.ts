import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { db } from '../db';
import { users } from '../db/schema';
import { desc } from 'drizzle-orm';

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
    return this.usersService.getRecentGames(userId);
  }

  @Get('leaderboard')
  async getLeaderboard() {
    const top = await db
      .select({
        username: users.username,
        eloRating: users.eloRating,
      })
      .from(users)
      .orderBy(desc(users.eloRating))
      .limit(100);
    return top;
  }
}
