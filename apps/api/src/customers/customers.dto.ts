import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertCustomerDto {
  @ApiProperty({ example: '+996700123456', description: 'Phone in E.164 (KG)' })
  @IsString()
  @Matches(/^\+?[0-9]{9,15}$/, { message: 'phone must be 9–15 digits, optional +' })
  phone!: string;

  @ApiPropertyOptional({ example: 'Айбек' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
