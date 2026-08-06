import { ValuationService } from './valuation.service';
import { AssessDto } from './valuation.dto';
export declare class ValuationController {
    private readonly valuation;
    constructor(valuation: ValuationService);
    assess(dto: AssessDto): Promise<import("./valuation").Valuation>;
}
