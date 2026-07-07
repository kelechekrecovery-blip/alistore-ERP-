import { Module } from '@nestjs/common';
import { SupplierRmaService } from './supplier-rma.service';
import { SuppliersController } from './suppliers.controller';

@Module({
  providers: [SupplierRmaService],
  controllers: [SuppliersController],
  exports: [SupplierRmaService],
})
export class SuppliersModule {}
