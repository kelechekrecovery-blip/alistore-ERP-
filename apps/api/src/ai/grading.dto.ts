import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceGrade } from './valuation';

export class PhotoEvidenceDto {
  @ApiPropertyOptional({ example: 'https://cdn.ali.kg/evidence/front.webp' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ example: 'cmrc_photo_front' })
  @IsOptional()
  @IsString()
  evidenceId?: string;

  @ApiPropertyOptional({ example: 'front' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'image/webp' })
  @IsOptional()
  @IsString()
  mimeType?: string;
}

export class GradePhotosDto {
  @ApiProperty({
    type: [PhotoEvidenceDto],
    description: 'Evidence Vault ids or photo URLs. At least one image reference is required.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhotoEvidenceDto)
  photos!: PhotoEvidenceDto[];

  @ApiPropertyOptional({ example: 'iPhone 15 Pro 256GB' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
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
  @IsString({ each: true })
  observedDefects?: string[];
}
