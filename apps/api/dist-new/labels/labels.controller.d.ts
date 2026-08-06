import { LabelsService } from './labels.service';
import { ImeiLabelDto, QrLabelDto } from './labels.dto';
export declare class LabelsController {
    private readonly labels;
    constructor(labels: LabelsService);
    unit(imei: string): Promise<{
        imei: string;
        product: string;
        status: string;
        svg: string;
    }>;
    imei(dto: ImeiLabelDto): {
        svg: string;
    };
    qr(dto: QrLabelDto): {
        svg: string;
    };
}
