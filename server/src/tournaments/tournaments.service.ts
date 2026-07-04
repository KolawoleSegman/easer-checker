import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { db } from '../db';
import {
  tournaments,
  tournamentPlayers,
  tournamentMatches,
} from '../db/schema';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class TournamentsService {
  async createTournament(
    userId: string,
    dto: { name: string; description: string; maxPlayers: number },
  ) {
    const [tournament] = await db
      .insert(tournaments)
      .values({
        name: dto.name,
        description: dto.description,
        createdBy: userId,
        maxPlayers: dto.maxPlayers || 8,
      })
      .returning();
    await db.insert(tournamentPlayers).values({
      tournamentId: tournament.id,
      userId: userId,
    });
    return tournament;
  }

  async joinTournament(userId: string, tournamentId: string) {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!tournament.length) throw new NotFoundException('Tournament not found');
    if (tournament[0].status !== 'WAITING')
      throw new BadRequestException('Tournament already started');
    const count = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    const maxPlayers = tournament[0].maxPlayers ?? 8;
    if (count.length >= maxPlayers)
      throw new BadRequestException('Tournament full');
    await db.insert(tournamentPlayers).values({ tournamentId, userId });
    return { message: 'Joined' };
  }

  async startTournament(userId: string, tournamentId: string) {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!tournament.length) throw new NotFoundException('Tournament not found');
    if (tournament[0].createdBy !== userId)
      throw new BadRequestException('Not authorized');
    if (tournament[0].status !== 'WAITING')
      throw new BadRequestException('Already started');
    const players = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    if (players.length < 2)
      throw new BadRequestException('Need at least 2 players');
    await db
      .update(tournaments)
      .set({ status: 'ACTIVE', startedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));
    const shuffled = players.sort(() => Math.random() - 0.5);
    const matches: any[] = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        const match = await db
          .insert(tournamentMatches)
          .values({
            tournamentId,
            round: 1,
            player1Id: shuffled[i].userId,
            player2Id: shuffled[i + 1].userId,
            status: 'PENDING',
          })
          .returning();
        matches.push(match[0]);
      }
    }
    return { message: 'Tournament started', matches };
  }

  async getTournaments() {
    return db.select().from(tournaments);
  }

  async getTournamentDetail(tournamentId: string) {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!tournament.length) throw new NotFoundException('Tournament not found');
    const players = await db
      .select({
        userId: tournamentPlayers.userId,
        username: users.username,
        status: tournamentPlayers.status,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.userId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    const matches = await db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, tournamentId));
    return { ...tournament[0], players, matches };
  }
}
