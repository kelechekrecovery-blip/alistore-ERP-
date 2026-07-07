import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { StaffAuthModule } from '../staff-auth/staff-auth.module';
import { AuthzModule } from '../authz/authz.module';

/** A4 PDF documents (pdf-lib) — trade-in contract; warranty talon can follow. */
@Module({
  imports: [StaffAuthModule, AuthzModule],
  providers: [DocumentsService],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
