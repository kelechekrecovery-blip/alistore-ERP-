import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChangePriceDto {
  @ApiProperty({ minimum: 0, example: 119900, description: 'New price (сом)' })
  @IsInt() @Min(0) price!: number;

  @ApiProperty({ example: 'подорожание у поставщика' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'senior_seller_azamat' })
  @IsOptional() @IsString() requester?: string;
}

export class DeleteProductDto {
  @ApiProperty({ example: 'снят с продажи' })
  @IsString() reason!: string;

  @ApiPropertyOptional({ example: 'owner' })
  @IsOptional() @IsString() requester?: string;
}
