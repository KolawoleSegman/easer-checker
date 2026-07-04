export class CreateGameDto {
  opponentId?: string;
  isAI?: boolean;
  isMultiplayer?: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
}
