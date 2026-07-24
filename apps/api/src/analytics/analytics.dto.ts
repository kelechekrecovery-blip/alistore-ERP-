import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Public ingestion payload. `type` is validated in the service against the closed
 * event list (a domain 422), not here, so an unknown type gets the same
 * ValidationError shape as the rest of the API. No customer identity is accepted
 * from the browser — it would be spoofable; the session id is anonymous.
 */
export class TrackEventDto {
  @ApiProperty({ example: 'product_view' })
  @IsString() @MaxLength(60) type!: string;

  @ApiProperty({ example: 'sess-8f3a', description: 'Anonymous browser/session id' })
  @IsString() @MaxLength(120) sessionId!: string;

  @ApiPropertyOptional({ example: 'prod_123' })
  @IsOptional() @IsString() @MaxLength(120) productId?: string;

  @ApiPropertyOptional({ example: 'meta', description: 'Last-touch attribution source (utm_source)' })
  @IsOptional() @IsString() @MaxLength(80) source?: string;

  @ApiPropertyOptional({ description: 'Small, non-PII context bag' })
  @IsOptional() @IsObject() props?: Record<string, unknown>;
}
