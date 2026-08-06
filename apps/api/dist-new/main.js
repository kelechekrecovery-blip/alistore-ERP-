"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const dotenv_1 = __importDefault(require("dotenv"));
const node_fs_1 = require("node:fs");
const app_module_1 = require("./app.module");
const openapi_1 = require("./openapi");
const helmet_1 = __importDefault(require("helmet"));
const runtime_security_1 = require("./config/runtime-security");
const runtime_env_files_1 = require("./config/runtime-env-files");
const production_preflight_1 = require("./health/production-preflight");
function preloadRuntimeEnvFiles() {
    for (const envFile of (0, runtime_env_files_1.resolveRuntimeEnvFiles)(process.env.NODE_ENV)) {
        if (!(0, node_fs_1.existsSync)(envFile))
            continue;
        dotenv_1.default.config({ path: envFile, override: false });
    }
}
async function bootstrap() {
    preloadRuntimeEnvFiles();
    const env = (name) => process.env[name];
    (0, production_preflight_1.assertProductionRuntimeReady)(env);
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    app.set('trust proxy', (0, runtime_security_1.resolveTrustProxy)(env));
    app.use((0, runtime_security_1.allowedHostsMiddleware)(env));
    app.setGlobalPrefix('api');
    app.useStaticAssets(process.env.MEDIA_LOCAL_DIR ?? './uploads', {
        prefix: process.env.MEDIA_PUBLIC_BASE ?? '/uploads',
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    app.enableCors((0, runtime_security_1.resolveCorsOptions)(env));
    app.use((0, helmet_1.default)((0, runtime_security_1.resolveHelmetOptions)(env)));
    (0, openapi_1.setupOpenApi)(app, (0, openapi_1.shouldExposeOpenApi)());
    const port = Number(process.env.PORT ?? 4000);
    await app.listen(port);
    console.log(`AliStore API listening on http://localhost:${port}/api`);
}
void bootstrap();
//# sourceMappingURL=main.js.map