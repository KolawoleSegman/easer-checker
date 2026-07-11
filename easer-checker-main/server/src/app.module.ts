import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { GamesModule } from './games/games.module';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { FriendsModule } from './friends/friends.module';
import { Gateway } from './gateway/gateway.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    GamesModule,
    UsersModule,
    ProfileModule,
    TournamentsModule,
    FriendsModule, // 👈 was missing — friends/challenge routes were dead without this
  ],
  providers: [Gateway],
})
export class AppModule {}
