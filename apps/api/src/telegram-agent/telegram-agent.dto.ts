import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class TelegramAgentStepUpDto {
  @ApiProperty({ description: 'Current six-digit staff TOTP code' })
  @IsString()
  @Length(6, 6)
  totpToken!: string;
}
