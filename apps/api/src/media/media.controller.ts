import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ValidationError } from '../common/errors';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Upload an image (multipart field `file`) → compressed WebP; returns key+url. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    }
    return this.media.ingestImage(file.buffer);
  }
}
