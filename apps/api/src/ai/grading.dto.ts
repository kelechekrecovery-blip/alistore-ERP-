import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceGrade } from './valuation';

export class PhotoEvidenceDto {
  @ApiPropertyOptional({ example: 'https://cdn.ali.kg/evidence/front.webp' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional({ example: 'cmrc_photo_front' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  evidenceId?: string;

  @ApiPropertyOptional({ example: 'front' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @ApiPropertyOptional({ example: 'image/webp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;
}

export class GradePhotosDto {
  @ApiProperty({
    type: [PhotoEvidenceDto],
    description: 'Evidence Vault ids or photo URLs. At least one image reference is required.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => PhotoEvidenceDto)
  photos!: PhotoEvidenceDto[];

  @ApiPropertyOptional({ example: 'iPhone 15 Pro 256GB' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string;

  @ApiPropertyOptional({ enum: ['A', 'B', 'C'], example: 'B' })
  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  claimedGrade?: DeviceGrade;

  @ApiPropertyOptional({
    type: [String],
    example: ['screen scratch', 'battery wear'],
    description: 'Manual intake findings. The keyless grader uses these deterministically.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  observedDefects?: string[];
}
