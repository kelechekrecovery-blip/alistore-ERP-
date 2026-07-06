import { IsNotEmpty, IsString } from 'class-validator';

export class ImeiLabelDto {
  @IsString() @IsNotEmpty() imei!: string;
}

export class QrLabelDto {
  @IsString() @IsNotEmpty() text!: string;
}
