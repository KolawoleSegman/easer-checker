import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateGameDto {
  @IsOptional()
  @IsString()
  opponentId?: string;

  @IsOptional()
  @IsBoolean()
  isAI?: boolean;

  @IsOptional()
  @IsBoolean()
  isMultiplayer?: boolean;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard', 'expert'])
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
}
