import { CategorySuggestion } from './categorize';
export declare class CategorizeService {
    private readonly logger;
    suggest(name: string, attrs?: Record<string, unknown>): Promise<CategorySuggestion>;
}
