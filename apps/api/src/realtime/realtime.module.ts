import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/** Real-time push over socket.io. Exports the gateway for producers to emit. */
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
