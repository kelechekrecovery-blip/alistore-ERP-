import { Module } from '@nestjs/common';
import { AppleRevocationProcessor } from './apple-revocation.processor';

@Module({
  providers: [AppleRevocationProcessor],
  exports: [AppleRevocationProcessor],
})
export class AppleIdentityModule {}
