---
name: alistore-project-council
description: Run an evidence-driven, multi-specialist project council for AliStore decisions. Use when evaluating architecture, product strategy, security, payments, retail operations, UX, reliability, release readiness, migrations, AI-agent permissions, or other consequential cross-functional changes that benefit from independent opinions, adversarial debate, explicit dissent, and a verified implementation plan.
---

# AliStore Project Council

Pressure-test consequential AliStore decisions with independent specialist lenses. Produce a decision, not a pile of personas.

## Operating boundaries

- Treat the council as read-only analysis by default.
- Do not edit code, deploy, publish, send messages, change external state, or accept legal terms during a council run unless the user separately authorizes that action.
- Never copy credentials, tokens, passwords, personal contact data, payment identifiers, or customer records into prompts or reports. Refer to secret names and redacted fingerprints only.
- Preserve PostgreSQL and the Event Ledger as business truth. Never trust identity, authorization, payment, approval, delivery, inventory, or demo flags supplied by clients.
- Prefer repository evidence and executable checks over consensus. Consensus is not proof.
- Stop with `BLOCKED` when critical evidence is unavailable or specialists expose an unresolved high-impact conflict.

## Select a mode

- `quick`: use the chair plus 3 independent reviewers for a reversible, narrow decision.
- `standard`: use the chair plus 5-6 lenses for architecture, implementation, workflow, or release planning.
- `deep`: use 7-8 lenses, external primary-source research when needed, and two debate rounds for security, money, data loss, migrations, legal exposure, or irreversible release decisions.
- Add a non-voting browser/test runner only when runtime behavior must be verified.

Use the smallest adequate mode. State the selected mode, lenses, expected output, and important evidence gaps before dispatch. Ask before a `deep` run if the user did not explicitly request exhaustive analysis.

## Build the evidence brief

1. Restate one concrete decision or proposal. Split unrelated decisions into separate councils.
2. Record hard constraints, affected users, success measures, rollback conditions, and explicitly excluded work.
3. Inspect only relevant files, diffs, tests, schemas, logs, and project documentation.
4. Use web research only for unstable or externally governed facts; prefer primary sources.
5. Sanitize the brief before delegation.
6. Label every material claim:
   - `VERIFIED`: supported by a cited file, line, command output, test, or primary source.
   - `INFERRED`: reasoned from verified facts; state the inference.
   - `ASSUMPTION`: unverified premise that could change the decision.
   - `UNKNOWN`: missing evidence requiring investigation.

## Assemble the panel

Read [roles.md](references/roles.md) and select only lenses materially relevant to the decision. Always include:

- one architecture or implementation lens;
- one product, customer, or operations lens;
- one adversarial Red Team lens.

For security, payment, privacy, inventory, accounting, migration, or release decisions, include the matching specialist. Do not create duplicate personas that share the same lens.

## Run independent review

Dispatch reviewers with isolated, task-local prompts. When agent tools are available:

- use fresh subagents with minimal inherited context;
- pass the sanitized evidence brief, relevant artifact paths, constraints, and output schema;
- tell each reviewer not to inspect other reviewers' work;
- run independent reviewers in parallel where capacity allows;
- schedule additional waves without showing later reviewers earlier opinions.

Require each reviewer to return:

1. recommendation: `PROCEED`, `REVISE`, `STOP`, or `BLOCKED`;
2. strongest supporting evidence;
3. top failure modes and affected parties;
4. assumptions and unknowns;
5. simplest viable alternative;
6. tests, metrics, rollback, and kill criteria;
7. confidence from 0-100 with a short calibration reason.

If fresh subagents or contexts are unavailable, label sequential lens outputs as correlated, not independent. Lower confidence and do not use this fallback for a decision whose safety depends on genuine independence.

## Anonymize and challenge

1. Rename first opinions `Candidate A`, `Candidate B`, and so on.
2. Remove persona names and stylistic clues before cross-review.
3. Have reviewers score candidates on:
   - factual support;
   - business and customer value;
   - security and privacy;
   - operational feasibility;
   - reliability and rollback;
   - simplicity and maintainability;
   - verification quality.
4. Require every reviewer to identify:
   - the strongest opposing argument;
   - one claim that lacks adequate evidence;
   - one likely hidden cost or second-order effect;
   - conditions that would reverse the reviewer's recommendation.
5. Run a second round only for unresolved blockers, close decisions, or `deep` mode. Cap debate at two rounds.

Do not let reviewers change facts silently. Any newly introduced claim must carry an evidence label.

## Synthesize as chair

The chair must:

1. resolve factual disputes through evidence or mark them unresolved;
2. distinguish blockers from refinements;
3. retain material minority dissent instead of averaging it away;
4. reject majority conclusions unsupported by evidence;
5. prefer the safest small version that preserves business value;
6. define observable acceptance, rollback, and kill criteria;
7. give a final status: `PROCEED`, `REVISE`, `STOP`, or `BLOCKED`;
8. state confidence as `high`, `medium`, or `low`.

Do not claim the council implemented or verified anything unless the corresponding commands or runtime checks actually ran.

## Return the council report

Use these exact sections and field forms so the report can be validated:

```markdown
# Council Decision
## Scope
Mode: quick|standard|deep
## Decision
Status: PROCEED|REVISE|STOP|BLOCKED
Summary: <one paragraph>
## Confidence
Level: high|medium|low
Reason: <calibration>
## Evidence
- VERIFIED|INFERRED|ASSUMPTION|UNKNOWN: <claim and citation>
## Blockers
- VERIFIED|INFERRED|ASSUMPTION|UNKNOWN: <blocker>
## Dissent
- VERIFIED|INFERRED|ASSUMPTION|UNKNOWN: <minority position>
## Risks
- VERIFIED|INFERRED|ASSUMPTION|UNKNOWN: <risk>
## Action Plan
### Action: <name>
- Owner: <role>
- Priority: <P0-P3>
- Dependencies: <items or None>
- Acceptance: <observable criterion>
- Rollback: <recovery action>
- Kill criterion: <observable stop condition>
## Verification
- VERIFIED|UNKNOWN: <executed or required check>
## Deferred Questions
- UNKNOWN: <question>
```

Include:

- a one-paragraph decision summary;
- a table of candidates and rubric results when there are 3 or more candidates;
- structured evidence entries with labels; use labeled entries in other sections for material factual claims;
- owner, priority, dependency, acceptance criterion, rollback, and kill criterion for each major action;
- exact `None found.` text when Blockers, Dissent, Risks, Action Plan, or Deferred Questions has no entry;
- no fenced copy of the report schema inside the finished report.

Save a durable report only when requested. Place accepted architecture decisions under `docs/decisions/` using the repository's ADR convention if one exists. Otherwise return the report in chat.

Before handing off a saved report, run:

```bash
python3 .agents/skills/alistore-project-council/scripts/validate_report.py <report.md>
```

The validator checks structure and runs Gitleaks as defense in depth against common credentials. It does not prove that prose is free of personal data; sanitize source material before writing and use the project's dedicated PII scan when raw customer artifacts were in scope.

## Convert decisions into work

After the user accepts the recommendation:

1. turn accepted actions into bounded phases and dependency-ordered tasks;
2. map each task to repository files, tests, evidence, owner role, and rollback;
3. keep rejected options and minority dissent in the decision record;
4. request separate authorization before implementation if the council run was analysis-only;
5. rerun the council when implementation evidence materially changes an assumption or crosses a kill criterion.
