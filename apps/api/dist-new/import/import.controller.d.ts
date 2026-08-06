import { ImportService } from './import.service';
import { AuthPrincipal } from '../auth/jwt.strategy';
export declare class ImportController {
    private readonly imports;
    constructor(imports: ImportService);
    products(user: AuthPrincipal, file?: Express.Multer.File): Promise<import("./import.types").ImportResult>;
}
