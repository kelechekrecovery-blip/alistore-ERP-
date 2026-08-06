"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRuntimeEnvFiles = resolveRuntimeEnvFiles;
function resolveRuntimeEnvFiles(nodeEnv) {
    const mode = nodeEnv?.trim().toLowerCase();
    if (mode === 'production') {
        return ['.env.production.local', '.env.production'];
    }
    if (mode === 'test') {
        return ['.env.test.local', '.env.test', '.env'];
    }
    return ['.env.local', '.env'];
}
//# sourceMappingURL=runtime-env-files.js.map