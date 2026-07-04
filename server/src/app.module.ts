import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { GamesModule } from './games/games.module';
import { UsersModule } from './users/users.module';
import { GatewayModule } from './gateway/gateway.module';
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    GamesModule,
    UsersModule,
    GatewayModule,
    ProfileModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
