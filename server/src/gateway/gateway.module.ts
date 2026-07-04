import { Module } from '@nestjs/common';
import { Gateway } from './gateway.gateway';
import { GamesModule } from '../games/games.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [GamesModule, AiModule],
  providers: [Gateway],
  exports: [Gateway],
})
export class GatewayModule {}
