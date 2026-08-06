import { PricingService } from './pricing.service';
export declare class PricingController {
    private readonly pricing;
    constructor(pricing: PricingService);
    review(): Promise<import("./pricing.service").PricingReport>;
}
