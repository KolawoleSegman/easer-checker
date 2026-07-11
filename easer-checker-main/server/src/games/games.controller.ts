import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';

@Controller('games')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true })) // ✅ auto‑transform and validate
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req, @Body() dto: CreateGameDto) {
    console.log(`🎮 Create game for user ${req.user.userId}`);
    return this.gamesService.createGame(req.user.userId, dto);
  }

  @Get(':id')
  async getGame(@Param('id') id: string, @Request() req) {
    console.log(`📖 Get game ${id} for user ${req.user.userId}`);
    return this.gamesService.getGame(id, req.user.userId);
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  async makeMove(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: MakeMoveDto,
  ) {
    console.log(`♟️ Move in game ${id} by user ${req.user.userId}:`, dto);
    const result = await this.gamesService.makeMove(id, req.user.userId, dto);
    console.log(`✅ Move result:`, result);
    return result;
  }
}
