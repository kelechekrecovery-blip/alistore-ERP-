import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlerterService } from '../observability/alerter.service';
import { OrdersService } from './orders.service';
export declare class OrderNoShowScheduler implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly orders;
    private readonly alerter;
    private readonly logger;
    private boss?;
    constructor(config: ConfigService, orders: OrdersService, alerter: AlerterService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
