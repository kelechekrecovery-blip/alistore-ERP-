import { GradePhotosDto } from './grading.dto';
import { GradingService } from './grading.service';
export declare class GradingController {
    private readonly grading;
    constructor(grading: GradingService);
    gradePhotos(dto: GradePhotosDto): Promise<import("./grading").PhotoGradingResult>;
}
