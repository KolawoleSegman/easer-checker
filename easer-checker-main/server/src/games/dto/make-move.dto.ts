import { IsNumber, IsNotEmpty } from 'class-validator';

export class MakeMoveDto {
  @IsNumber()
  @IsNotEmpty()
  fromRow: number;

  @IsNumber()
  @IsNotEmpty()
  fromCol: number;

  @IsNumber()
  @IsNotEmpty()
  toRow: number;

  @IsNumber()
  @IsNotEmpty()
  toCol: number;
}
