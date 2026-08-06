import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReservationsService } from './reservations.service';
import { ExchangesService } from '../exchanges/exchanges.service';
import { AlerterService } from '../observability/alerter.service';
export declare class ReservationsScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly reservations;
    private readonly exchanges;
    private readonly alerter;
    private readonly logger;
    private boss?;
    constructor(config: ConfigService, reservations: ReservationsService, exchanges: ExchangesService, alerter: AlerterService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
