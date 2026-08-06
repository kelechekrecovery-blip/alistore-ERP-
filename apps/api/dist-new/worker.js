"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const production_preflight_1 = require("./health/production-preflight");
async function bootstrap() {
    process.env.PROCESS_ROLE = 'worker';
    (0, production_preflight_1.assertProductionRuntimeReady)((name) => process.env[name]);
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule);
    app.enableShutdownHooks();
    console.log('AliStore worker ready');
}
void bootstrap();
//# sourceMappingURL=worker.js.map