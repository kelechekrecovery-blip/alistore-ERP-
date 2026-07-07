import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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

export class CreateProductReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt() @Min(1) @Max(5) rating!: number;

  @ApiPropertyOptional({ example: 'Быстро доставили, устройство как новое.' })
  @IsOptional() @IsString() @MaxLength(500) text?: string;

  @ApiPropertyOptional({ description: 'Specific paid/completed order to attach the review to.' })
  @IsOptional() @IsString() orderId?: string;
}
