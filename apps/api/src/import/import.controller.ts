import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ValidationError } from '../common/errors';

@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  /** Upload a product Excel (multipart `file`) → upsert products by SKU. */
  @Post('products')
  @UseInterceptors(FileInterceptor('file'))
  async products(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    }
    return this.imports.importProducts(file.buffer);
  }
}
