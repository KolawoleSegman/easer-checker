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
  games,
  users,
} from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { GamesService, GameFinishedEvent } from '../games/games.service';

@Injectable()
export class TournamentsService {
  constructor(private gamesService: GamesService) {
    // The server itself advances the bracket the moment a tournament game
    // ends. Before, every browser polled and POSTed the result, which both
    // spammed the API and could advance the same round more than once.
    this.gamesService.onGameFinished((e) => this.handleGameFinished(e));
  }

  async createTournament(
    userId: string,
    dto: { name: string; description?: string; maxPlayers?: number },
  ) {
    const name = (dto?.name || '').trim();
    if (!name) throw new BadRequestException('Tournament name is required');
    const maxPlayers = Math.min(Math.max(Number(dto.maxPlayers) || 8, 2), 64);

    const [tournament] = await db
      .insert(tournaments)
      .values({
        name: name.slice(0, 80),
        description: (dto.description || '').slice(0, 300),
        createdBy: userId,
        maxPlayers,
        status: 'WAITING',
      })
      .returning();
    await db.insert(tournamentPlayers).values({
      tournamentId: tournament.id,
      userId,
    });
    return tournament;
  }

  async joinTournament(userId: string, tournamentId: string) {
    const tournament = db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .get();
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.status !== 'WAITING')
      throw new BadRequestException('Tournament already started or completed');

    const players = db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .all();
    if (players.length >= (tournament.maxPlayers ?? 8))
      throw new BadRequestException('Tournament is full');
    if (players.some((p) => p.userId === userId))
      throw new BadRequestException('Already joined');

    await db.insert(tournamentPlayers).values({ tournamentId, userId });
    return { message: 'Joined tournament successfully' };
  }

  async startTournament(userId: string, tournamentId: string) {
    const tournament = db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .get();
    if (!tournament) throw new NotFoundException('Tournament not found');
    if (tournament.createdBy !== userId)
      throw new ForbiddenException('Only the creator can start the tournament');
    if (tournament.status !== 'WAITING')
      throw new BadRequestException('Tournament already started');

    const players = db
      .select()
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .all();
    if (players.length < 2)
      throw new BadRequestException('Need at least 2 players to start');

    await db
      .update(tournaments)
      .set({ status: 'ACTIVE', startedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    // Proper shuffle (the old `sort(() => Math.random() - 0.5)` is biased).
    const ids = players.map((p) => p.userId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    const created = await this.createRound(tournamentId, 1, ids);
    return { message: 'Tournament started', matches: created };
  }

  /**
   * Pairs players for a round. If the count is odd, the last player gets a
   * bye: a match that is already completed in their favour, so they move on
   * to the next round. (Byes used to be silently dropped, which removed that
   * player from the tournament entirely.)
   */
  private async createRound(
    tournamentId: string,
    round: number,
    playerIds: string[],
  ) {
    const created: any[] = [];
    for (let i = 0; i < playerIds.length; i += 2) {
      const player1Id = playerIds[i];
      const player2Id = playerIds[i + 1];

      if (!player2Id) {
        const [bye] = (db
          .insert(tournamentMatches)
          .values({
            tournamentId,
            round,
            player1Id,
            player2Id: null,
            winnerId: player1Id,
            status: 'COMPLETED',
          })
          .returning() as any)
          .all() as any[];
        created.push(bye);
        continue;
      }

      const game = await this.gamesService.createGame(player1Id, {
        opponentId: player2Id,
      });
      const [match] = (db
        .insert(tournamentMatches)
        .values({
          tournamentId,
          round,
          player1Id,
          player2Id,
          gameId: game.id,
          status: 'IN_PROGRESS',
        })
        .returning() as any)
        .all() as any[];
      created.push(match);
    }
    return created;
  }

  /** Called by the games service whenever any game ends. */
  private async handleGameFinished(e: GameFinishedEvent) {
    const match = db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.gameId, e.gameId))
      .get();
    if (!match || match.status === 'COMPLETED') return;

    if (e.status === 'DRAW' || !e.winnerId) {
      // A drawn tournament game must be replayed: create a fresh game with
      // colours swapped and point the match at it.
      if (e.status === 'DRAW' && match.player1Id && match.player2Id) {
        const rematch = await this.gamesService.createGame(match.player2Id, {
          opponentId: match.player1Id,
        });
        await db
          .update(tournamentMatches)
          .set({ gameId: rematch.id })
          .where(eq(tournamentMatches.id, match.id));
      }
      return;
    }
    await this.completeMatch(match, e.winnerId);
  }

  /**
   * Manual reporting endpoint kept for the existing client. It no longer
   * trusts the caller: the result must match a game that has really finished,
   * and reporting twice is harmless.
   */
  async reportMatchResult(userId: string, matchId: string, winnerId: string) {
    const match = db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, matchId))
      .get();
    if (!match) throw new NotFoundException('Match not found');

    if (match.player1Id !== userId && match.player2Id !== userId) {
      throw new ForbiddenException('You are not a player in this match');
    }
    if (match.status === 'COMPLETED') return { message: 'Result already recorded' };

    if (!match.gameId) throw new BadRequestException('Match has no game');
    const game = db
      .select()
      .from(games)
      .where(eq(games.id, match.gameId))
      .get();
    if (!game || game.status === 'ACTIVE' || game.status === 'DRAW') {
      throw new BadRequestException('The game for this match is not finished');
    }
    if (!game.winnerId || game.winnerId !== winnerId) {
      throw new BadRequestException('Reported winner does not match the game result');
    }

    await this.completeMatch(match, game.winnerId);
    return { message: 'Result recorded' };
  }

  private async completeMatch(
    match: typeof tournamentMatches.$inferSelect,
    winnerId: string,
  ) {
    // Conditional update makes this idempotent even if called concurrently.
    const res = db
      .update(tournamentMatches)
      .set({ status: 'COMPLETED', winnerId })
      .where(
        and(
          eq(tournamentMatches.id, match.id),
          eq(tournamentMatches.status, 'IN_PROGRESS'),
        ),
      )
      .run();
    if (res.changes === 0) return;

    const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
    if (loserId) {
      // Scoped to THIS tournament — it used to eliminate the player in every
      // tournament they were in.
      await db
        .update(tournamentPlayers)
        .set({ status: 'ELIMINATED' })
        .where(
          and(
            eq(tournamentPlayers.tournamentId, match.tournamentId),
            eq(tournamentPlayers.userId, loserId),
          ),
        );
    }
    await this.maybeAdvanceRound(match.tournamentId, match.round);
  }

  private async maybeAdvanceRound(tournamentId: string, round: number) {
    const all = db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, tournamentId))
      .all();
    // Only advance from the latest round, once, when all its matches are done.
    const latest = Math.max(...all.map((m) => m.round));
    if (round !== latest) return;
    const thisRound = all.filter((m) => m.round === round);
    if (thisRound.length === 0 || !thisRound.every((m) => m.status === 'COMPLETED')) return;

    const winners = thisRound
      .map((m) => m.winnerId)
      .filter((w): w is string => !!w);

    if (winners.length <= 1) {
      await db
        .update(tournaments)
        .set({ status: 'FINISHED', endedAt: new Date() })
        .where(eq(tournaments.id, tournamentId));
      if (winners.length === 1) {
        await db
          .update(tournamentPlayers)
          .set({ status: 'WINNER' })
          .where(
            and(
              eq(tournamentPlayers.tournamentId, tournamentId),
              eq(tournamentPlayers.userId, winners[0]),
            ),
          );
      }
      return;
    }

    await this.createRound(tournamentId, round + 1, winners);
    // A round made only of byes would be complete instantly — keep going.
    await this.maybeAdvanceRound(tournamentId, round + 1);
  }

  async getTournaments() {
    const rows = db.select().from(tournaments).all();
    if (rows.length === 0) return [];
    const players = db
      .select({
        tournamentId: tournamentPlayers.tournamentId,
        userId: tournamentPlayers.userId,
      })
      .from(tournamentPlayers)
      .where(
        inArray(
          tournamentPlayers.tournamentId,
          rows.map((t) => t.id),
        ),
      )
      .all();
    const counts = new Map<string, number>();
    for (const p of players) counts.set(p.tournamentId, (counts.get(p.tournamentId) || 0) + 1);
    return rows
      .map((t) => ({ ...t, playerCount: counts.get(t.id) || 0 }))
      .sort((a, b) => +new Date(b.createdAt as any) - +new Date(a.createdAt as any));
  }

  async getTournamentDetail(tournamentId: string) {
    const tournament = db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .get();
    if (!tournament) throw new NotFoundException('Tournament not found');

    const players = db
      .select({
        userId: tournamentPlayers.userId,
        username: users.username,
        status: tournamentPlayers.status,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.userId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .all();

    const matches = db
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.tournamentId, tournamentId))
      .all();

    return { ...tournament, players, matches };
  }
}
