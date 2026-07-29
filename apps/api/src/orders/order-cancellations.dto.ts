import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrderCancellationDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Передумал до отправки заказа поставщику',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
