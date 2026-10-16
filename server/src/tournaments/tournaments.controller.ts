import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
@UseGuards(AuthGuard('jwt'))
export class TournamentsController {
  constructor(private tournamentsService: TournamentsService) {}

  @Get()
  getTournaments() {
    return this.tournamentsService.getTournaments();
  }

  @Get(':id')
  getTournament(@Param('id') id: string) {
    return this.tournamentsService.getTournamentDetail(id);
  }

  @Post()
  create(@Request() req, @Body() dto: any) {
    return this.tournamentsService.createTournament(req.user.userId, dto);
  }

  @Post(':id/join')
  join(@Request() req, @Param('id') id: string) {
    return this.tournamentsService.joinTournament(req.user.userId, id);
  }

  @Put(':id/start')
  start(@Request() req, @Param('id') id: string) {
    return this.tournamentsService.startTournament(req.user.userId, id);
  }

  @Post('match/:matchId/result')
  reportResult(
    @Request() req,
    @Param('matchId') matchId: string,
    @Body() dto: { winnerId: string },
  ) {
    return this.tournamentsService.reportMatchResult(
      req.user.userId,
      matchId,
      dto.winnerId,
    );
  }
}
