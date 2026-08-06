import { PhotoGradingInput, PhotoGradingResult } from './grading';
export declare class GradingService {
    private readonly logger;
    grade(input: PhotoGradingInput): Promise<PhotoGradingResult>;
    private gradeFromLabels;
}
