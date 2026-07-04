import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';

@Controller('games')
@UseGuards(AuthGuard('jwt'))
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateGameDto) {
    return this.gamesService.createGame(req.user.userId, dto);
  }

  @Get(':id')
  getGame(@Param('id') id: string, @Request() req) {
    return this.gamesService.getGame(id, req.user.userId);
  }

  @Post(':id/move')
  makeMove(@Param('id') id: string, @Request() req, @Body() dto: MakeMoveDto) {
    return this.gamesService.makeMove(id, req.user.userId, dto);
  }
}
