import { IsInt, Min, Max } from 'class-validator';

export class MakeMoveDto {
  @IsInt()
  @Min(0)
  @Max(9)
  fromRow: number;

  @IsInt()
  @Min(0)
  @Max(9)
  fromCol: number;

  @IsInt()
  @Min(0)
  @Max(9)
  toRow: number;

  @IsInt()
  @Min(0)
  @Max(9)
  toCol: number;
}
