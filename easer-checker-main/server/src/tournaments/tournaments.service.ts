import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { db } from '../db';
import {
  tournaments,
  tournamentPlayers,
  tournamentMatches,
} from '../db/schema';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { GamesService } from '../games/games.service';

@Injectable()
export class TournamentsService {
  constructor(private gamesService: GamesService) {}

  async createTournament(
    userId: string,
    dto: { name: string; description: string; maxPlayers: number },
  ) {
    const [tournament] = await db
      .insert(tournaments)
      .values({
        name: dto.name,
        description: dto.description || '',
        createdBy: userId,
        maxPlayers: dto.maxPlayers || 8,
        status: 'WAITING',
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
      throw new BadRequestException('Tournament already started or completed');

    const players = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    const maxPlayers = tournament[0].maxPlayers ?? 8;
    if (players.length >= maxPlayers)
      throw new BadRequestException('Tournament is full');

    // Check if already joined
    const alreadyJoined = players.some((p) => p.userId === userId);
    if (alreadyJoined) throw new BadRequestException('Already joined');

    await db.insert(tournamentPlayers).values({ tournamentId, userId });
    return { message: 'Joined tournament successfully' };
  }

  async startTournament(userId: string, tournamentId: string) {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));
    if (!tournament.length) throw new NotFoundException('Tournament not found');
    if (tournament[0].createdBy !== userId)
      throw new BadRequestException('Only the creator can start the tournament');
    if (tournament[0].status !== 'WAITING')
      throw new BadRequestException('Tournament already started');

    const players = await db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    if (players.length < 2)
      throw new BadRequestException('Need at least 2 players to start');

    await db
      .update(tournaments)
      .set({ status: 'ACTIVE', startedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    // Shuffle players and create matches for round 1
    const shuffled = players.sort(() => Math.random() - 0.5);
    const matches: any[] = [];
    const byes: string[] = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      if (i + 1 < shuffled.length) {
        const player1Id = shuffled[i].userId;
        const player2Id = shuffled[i + 1].userId;

        // Create a real game so the players can actually play the match.
        const game = await this.gamesService.createGame(player1Id, {
          opponentId: player2Id,
        });

        const result = (await db
          .insert(tournamentMatches)
          .values({
            tournamentId,
            round: 1,
            player1Id,
            player2Id,
            gameId: game.id,
            status: 'IN_PROGRESS',
          })
          .returning()) as any[];

        if (result && result.length > 0) {
          matches.push(result[0]);
        }
      } else {
        // Odd player out gets a bye straight through to the next round.
        byes.push(shuffled[i].userId);
      }
    }

    return { message: 'Tournament started', matches, byes };
  }

  /**
   * Report the winner of a match. Marks the match complete and, once every
   * match in the round has a result, seeds the next round automatically.
   */
  async reportMatchResult(userId: string, matchId: string, winnerId: string) {
    const match = await db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, matchId));
    if (!match.length) throw new NotFoundException('Match not found');
    const m = match[0];

    if (m.player1Id !== userId && m.player2Id !== userId) {
      throw new ForbiddenException('You are not a player in this match');
    }
    if (winnerId !== m.player1Id && winnerId !== m.player2Id) {
      throw new BadRequestException('Winner must be one of the match players');
    }

    await db
      .update(tournamentMatches)
      .set({ status: 'COMPLETED', winnerId })
      .where(eq(tournamentMatches.id, matchId));

    // Mark the loser eliminated.
    const loserId = winnerId === m.player1Id ? m.player2Id : m.player1Id;
    if (loserId) {
      await db
        .update(tournamentPlayers)
        .set({ status: 'ELIMINATED' })
        .where(eq(tournamentPlayers.userId, loserId));
    }

    await this.maybeAdvanceRound(m.tournamentId, m.round);

    return { message: 'Result recorded' };
  }

  private async maybeAdvanceRound(tournamentId: string, round: number) {
    const roundMatches = await db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, tournamentId));
    const thisRound = roundMatches.filter((m) => m.round === round);
    const allDone = thisRound.every((m) => m.status === 'COMPLETED');
    if (!allDone || thisRound.length === 0) return;

    const winners = thisRound
      .map((m) => m.winnerId)
      .filter((w): w is string => !!w);

    if (winners.length <= 1) {
      // Tournament finished.
      await db
        .update(tournaments)
        .set({ status: 'FINISHED', endedAt: new Date() })
        .where(eq(tournaments.id, tournamentId));
      if (winners.length === 1) {
        await db
          .update(tournamentPlayers)
          .set({ status: 'WINNER' })
          .where(eq(tournamentPlayers.userId, winners[0]));
      }
      return;
    }

    const nextRound = round + 1;
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        const player1Id = winners[i];
        const player2Id = winners[i + 1];
        const game = await this.gamesService.createGame(player1Id, {
          opponentId: player2Id,
        });
        await db.insert(tournamentMatches).values({
          tournamentId,
          round: nextRound,
          player1Id,
          player2Id,
          gameId: game.id,
          status: 'IN_PROGRESS',
        });
      }
    }
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
