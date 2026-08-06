import { PriceScoutDto } from './price-scout.dto';
import { PriceScoutService } from './price-scout.service';
export declare class PriceScoutController {
    private readonly priceScout;
    constructor(priceScout: PriceScoutService);
    scout(dto: PriceScoutDto): Promise<import("./price-scout").PriceScoutResult>;
}
