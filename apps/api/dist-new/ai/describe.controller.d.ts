import { DescribeService } from './describe.service';
import { DescribeDto } from './describe.dto';
export declare class DescribeController {
    private readonly describe;
    constructor(describe: DescribeService);
    describeProduct(dto: DescribeDto): Promise<import("./describe").ProductDescription>;
}
