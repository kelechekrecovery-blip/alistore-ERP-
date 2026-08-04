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
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { ValidationError } from '../common/errors';

@Controller('import')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  /** Upload a product Excel (multipart `file`) → upsert products by SKU. */
  @Post('products')
  @RequirePermission('products', 'create')
  @UseInterceptors(FileInterceptor('file'))
  async products(@CurrentUser() user: AuthPrincipal, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    }
    return this.imports.importProducts(file.buffer, user.customerId);
  }
}
