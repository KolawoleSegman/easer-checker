import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { AiModule } from '../ai/ai.module';
import { UsersModule } from '../users/users.module';
import { FriendsModule } from '../friends/friends.module';
import { Game } from './entities/game.entity';
import { Move } from './entities/move.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Move]), // <-- needed for repositories
    AiModule, // if AI service is used
    UsersModule, // if GamesService uses UsersService
    FriendsModule, // if GamesService uses FriendsService
  ],
  providers: [GamesService],
  controllers: [GamesController],
  exports: [GamesService],
})
export class GamesModule {}
