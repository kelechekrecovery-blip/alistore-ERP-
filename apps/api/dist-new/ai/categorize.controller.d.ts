import { CategorizeService } from './categorize.service';
import { CategorizeDto } from './categorize.dto';
export declare class CategorizeController {
    private readonly categorize;
    constructor(categorize: CategorizeService);
    categorizeProduct(dto: CategorizeDto): Promise<import("./categorize").CategorySuggestion>;
}
