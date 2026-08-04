# AliStore Engineering Toolchain

## Installed foundation

- Spec Kit: specification, plan, task, and implementation workflow.
- Serena: TypeScript, Swift, and Kotlin semantic navigation through LSP.
- XcodeBuildMCP and Apple Docs MCP: native build, simulator, UI automation,
  coverage, and primary Apple documentation access.
- Chrome DevTools MCP: isolated browser inspection for console, network,
  performance, and rendering diagnostics.
- Schemathesis: OpenAPI fuzzing against a running non-production API.
- fast-check: property and model-based tests for domain invariants.
- Testcontainers: disposable PostgreSQL, Redis, search, and storage services.
- Toxiproxy: deterministic latency, timeout, reset, and outage tests.
- axe Playwright: serious and critical accessibility checks.
- Lighthouse CI: performance and accessibility budgets.
- StrykerJS: targeted mutation testing for high-risk domain modules.
- Gitleaks, OSV-Scanner, and k6: secrets, dependency, and load checks.

Run `npm run tooling:verify` to see the local installation state. Semgrep,
Trivy, and Maestro are optional locally because the same checks can run in CI;
their absence must not be confused with a passed security or mobile release
gate.

## Safe usage

`npm run api:fuzz` requires a local non-production API with Swagger enabled; never aim
generative tests at production. `npm run perf:smoke` defaults to local ports and
accepts `BASE_URL`, `API_URL`, `VUS`, and `DURATION` overrides.

Tool installation alone does not establish coverage. Property models,
Testcontainers fixtures, chaos scenarios, mutation targets, and native Maestro
flows are delivered as bounded backlog items with their own gates.

The committed `.mcp.json` contains only executable configuration. Credentials,
provider tokens, App Store keys, and production environment values must remain
outside Git.
