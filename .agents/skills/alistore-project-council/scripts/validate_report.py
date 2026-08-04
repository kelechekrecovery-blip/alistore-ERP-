#!/usr/bin/env python3
"""Validate the structure and common-secret safety of a council report."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

MAX_REPORT_BYTES = 2 * 1024 * 1024
REQUIRED_HEADINGS = (
    "# Council Decision",
    "## Scope",
    "## Decision",
    "## Confidence",
    "## Evidence",
    "## Blockers",
    "## Dissent",
    "## Risks",
    "## Action Plan",
    "## Verification",
    "## Deferred Questions",
)
OPTIONAL_EMPTY_SECTIONS = {
    "## Blockers",
    "## Dissent",
    "## Risks",
    "## Action Plan",
    "## Deferred Questions",
}
SECRET_PATTERNS = {
    "Telegram bot token": re.compile(r"\b\d{8,12}:[A-Za-z0-9_-]{30,}\b"),
    "OpenAI-style API key": re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b"),
    "GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    "Slack token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b"),
    "AWS access key": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "JWT": re.compile(
        r"\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"
    ),
    "credential-bearing database URI": re.compile(
        r"(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^:\s/]+:[^@\s/]+@"
    ),
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
}
ACTION_FIELDS = (
    "Owner",
    "Priority",
    "Dependencies",
    "Acceptance",
    "Rollback",
    "Kill criterion",
)


def split_fenced_code(text: str) -> tuple[str, list[str]]:
    """Return prose outside fences and the contents of fenced code blocks."""
    output: list[str] = []
    blocks: list[str] = []
    current_block: list[str] = []
    fence_char: str | None = None
    fence_length = 0

    for line in text.splitlines():
        if fence_char is None:
            opening = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
            if opening:
                token = opening.group(1)
                fence_char = token[0]
                fence_length = len(token)
                current_block = []
                continue
            output.append(line)
        else:
            closing = re.match(
                rf"^ {{0,3}}{re.escape(fence_char)}{{{fence_length},}}\s*$",
                line,
            )
            if closing:
                blocks.append("\n".join(current_block))
                fence_char = None
                fence_length = 0
                current_block = []
                continue
            current_block.append(line)

    if fence_char is not None:
        blocks.append("\n".join(current_block))
    return "\n".join(output), blocks


def parse_sections(text: str) -> tuple[dict[str, str], list[str]]:
    """Extract each required section exactly once and in contract order."""
    clean_text, fenced_blocks = split_fenced_code(text)
    lines = clean_text.splitlines()
    occurrences: dict[str, list[int]] = {heading: [] for heading in REQUIRED_HEADINGS}
    errors: list[str] = []

    for index, line in enumerate(lines):
        heading_match = re.match(r"^ {0,3}(#{1,6}\s+\S.*)$", line)
        if not heading_match:
            continue
        normalized = heading_match.group(1).rstrip()
        if normalized in occurrences:
            occurrences[normalized].append(index)
        elif re.match(r"^#{1,2}\s+\S", normalized):
            errors.append(f"unexpected H1/H2 heading: {normalized}")

    for block in fenced_blocks:
        indexes = [block.find(heading) for heading in REQUIRED_HEADINGS]
        if all(index >= 0 for index in indexes) and indexes == sorted(indexes):
            errors.append(
                "finished report must not contain a fenced copy of the report schema"
            )

    for heading, indexes in occurrences.items():
        if len(indexes) != 1:
            errors.append(
                f"expected exactly one heading outside code fences: {heading}"
            )

    if errors:
        return {}, errors

    indexes = [occurrences[heading][0] for heading in REQUIRED_HEADINGS]
    if indexes != sorted(indexes):
        return {}, ["required headings are out of order"]

    sections: dict[str, str] = {}
    for position, heading in enumerate(REQUIRED_HEADINGS):
        start = indexes[position] + 1
        end = indexes[position + 1] if position + 1 < len(indexes) else len(lines)
        sections[heading] = "\n".join(lines[start:end]).strip()

    return sections, []


def validate_action_plan(body: str) -> list[str]:
    if body == "None found.":
        return []

    matches = list(re.finditer(r"(?m)^### Action:\s+\S.*$", body))
    if not matches:
        return ["Action Plan must contain '### Action: <name>' or exact 'None found.'"]
    if body[: matches[0].start()].strip():
        return ["Action Plan must not mix preamble or 'None found.' with actions"]

    errors: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        action = body[match.end() : end]
        action_name = match.group(0).removeprefix("### Action:").strip()
        action_lines = [line.strip() for line in action.splitlines() if line.strip()]
        recognized_lines = 0
        for field in ACTION_FIELDS:
            field_matches = [
                line
                for line in action_lines
                if re.match(rf"^-\s+{re.escape(field)}:\s*", line)
            ]
            recognized_lines += len(field_matches)
            if len(field_matches) != 1:
                errors.append(
                    f"action '{action_name}' must contain field exactly once: {field}"
                )
                continue
            value = re.sub(
                rf"^-\s+{re.escape(field)}:\s*", "", field_matches[0]
            ).strip()
            if not value:
                errors.append(f"action '{action_name}' has an empty field: {field}")
        if recognized_lines != len(action_lines):
            errors.append(
                f"action '{action_name}' contains an unknown or malformed field"
            )

        priority_matches = [
            line for line in action_lines if re.match(r"^-\s+Priority:\s*", line)
        ]
        if len(priority_matches) == 1:
            priority_value = re.sub(
                r"^-\s+Priority:\s*", "", priority_matches[0]
            ).strip()
        else:
            priority_value = ""
        if priority_value and not re.fullmatch(r"P[0-3]", priority_value):
            errors.append(f"action '{action_name}' priority must be P0, P1, P2, or P3")
    return errors


def validate_labeled_section(
    heading: str,
    body: str,
    allowed_labels: tuple[str, ...],
    *,
    allow_none: bool,
) -> list[str]:
    if allow_none and body == "None found.":
        return []

    allowed = "|".join(re.escape(label) for label in allowed_labels)
    entry_re = re.compile(rf"^-\s+(?:{allowed}):\s+\S")
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    if not lines:
        return [f"{heading} must not be empty"]

    errors: list[str] = []
    for line in lines:
        if not entry_re.match(line):
            errors.append(
                f"{heading} entries must be one-line labeled bullets using: {', '.join(allowed_labels)}"
            )
            break
    return errors


def scan_common_secrets(text: str) -> list[str]:
    errors: list[str] = []
    for name, pattern in SECRET_PATTERNS.items():
        if pattern.search(text):
            errors.append(f"possible secret exposed: {name}")
    return errors


def scan_with_gitleaks(text: str) -> list[str]:
    executable = shutil.which("gitleaks")
    if executable is None:
        return ["Gitleaks is required for report secret scanning but was not found"]

    try:
        result = subprocess.run(
            [
                executable,
                "stdin",
                "--no-banner",
                "--no-color",
                "--redact=100",
                "--ignore-gitleaks-allow",
                "--timeout=10",
            ],
            input=text,
            text=True,
            capture_output=True,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as error:
        return [f"Gitleaks scan failed: {error.__class__.__name__}"]

    if result.returncode == 1:
        return ["Gitleaks detected a possible secret"]
    if result.returncode != 0:
        return [f"Gitleaks scan failed with exit code {result.returncode}"]
    return []


def validate(text: str, *, run_gitleaks: bool = True) -> list[str]:
    sections, errors = parse_sections(text)
    if errors:
        return errors + scan_common_secrets(text)

    for heading, body in sections.items():
        if heading == "# Council Decision":
            continue
        if not body:
            errors.append(f"section must not be empty: {heading}")

    scope = sections["## Scope"]
    if not re.search(r"(?m)^Mode:\s+(quick|standard|deep)\s*$", scope):
        errors.append("Scope must contain exact Mode: quick, standard, or deep")

    decision = sections["## Decision"].splitlines()
    if not decision or not re.fullmatch(
        r"Status:\s+(PROCEED|REVISE|STOP|BLOCKED)", decision[0].strip()
    ):
        errors.append("Decision first line must be an exact uppercase Status field")
    if not any(re.match(r"^Summary:\s+\S", line.strip()) for line in decision[1:]):
        errors.append("Decision must contain a non-empty Summary field")

    confidence = sections["## Confidence"].splitlines()
    if not confidence or not re.fullmatch(
        r"Level:\s+(high|medium|low)", confidence[0].strip()
    ):
        errors.append("Confidence first line must be Level: high, medium, or low")
    if not any(re.match(r"^Reason:\s+\S", line.strip()) for line in confidence[1:]):
        errors.append("Confidence must contain a non-empty Reason field")

    errors.extend(
        validate_labeled_section(
            "Evidence",
            sections["## Evidence"],
            ("VERIFIED", "INFERRED", "ASSUMPTION", "UNKNOWN"),
            allow_none=False,
        )
    )
    for heading in ("## Blockers", "## Dissent", "## Risks"):
        errors.extend(
            validate_labeled_section(
                heading.removeprefix("## "),
                sections[heading],
                ("VERIFIED", "INFERRED", "ASSUMPTION", "UNKNOWN"),
                allow_none=True,
            )
        )
    errors.extend(
        validate_labeled_section(
            "Deferred Questions",
            sections["## Deferred Questions"],
            ("UNKNOWN",),
            allow_none=True,
        )
    )

    errors.extend(validate_action_plan(sections["## Action Plan"]))
    errors.extend(
        validate_labeled_section(
            "Verification",
            sections["## Verification"],
            ("VERIFIED", "UNKNOWN"),
            allow_none=False,
        )
    )

    for heading in OPTIONAL_EMPTY_SECTIONS:
        body = sections[heading]
        if body.lower() in {"none", "n/a", "not applicable"}:
            errors.append(f"{heading.removeprefix('## ')} must use exact 'None found.'")

    errors.extend(scan_common_secrets(text))
    if run_gitleaks:
        errors.extend(scan_with_gitleaks(text))
    return errors


def sample_report() -> str:
    return """# Council Decision
## Scope
Mode: quick
Review a reversible decision.
## Decision
Status: REVISE
Summary: Narrow the proposal before implementation.
## Confidence
Level: medium
Reason: Source evidence exists, but runtime verification is pending.
## Evidence
- VERIFIED: A source test passed.
## Blockers
None found.
## Dissent
None found.
## Risks
- INFERRED: A bounded operational risk remains.
## Action Plan
### Action: Add a guarded feature
- Owner: Principal architect
- Priority: P1
- Dependencies: Approved design
- Acceptance: Targeted tests pass
- Rollback: Disable the feature flag
- Kill criterion: Any unauthorized operation succeeds
## Verification
- VERIFIED: Static validation passed.
## Deferred Questions
- UNKNOWN: Which runtime metric should gate rollout?
"""


def self_test() -> int:
    valid = sample_report()
    cases = {
        "valid": (valid, False),
        "empty decision": (valid.replace("Status: REVISE", ""), True),
        "lowercase decision": (valid.replace("Status: REVISE", "Status: revise"), True),
        "empty blockers": (
            valid.replace("## Blockers\nNone found.", "## Blockers"),
            True,
        ),
        "missing action field": (
            valid.replace("- Owner: Principal architect\n", ""),
            True,
        ),
        "headings only in fence": (f"```markdown\n{valid}\n```", True),
        "unlabeled evidence": (
            valid.replace(
                "- VERIFIED: A source test passed.", "- A source test passed."
            ),
            True,
        ),
        "extra unlabeled risk": (
            valid.replace(
                "- INFERRED: A bounded operational risk remains.",
                "- INFERRED: A bounded operational risk remains.\n- Unlabeled risk.",
            ),
            True,
        ),
        "pseudo closing fence": (f"```markdown\n```not-a-close\n{valid}", True),
        "indented code headings": (
            "\n".join(f"    {line}" for line in valid.splitlines()),
            True,
        ),
        "duplicate action owner": (
            valid.replace(
                "- Owner: Principal architect",
                "- Owner: Principal architect\n- Owner: Product owner",
            ),
            True,
        ),
        "mixed none and action": (
            valid.replace(
                "## Action Plan\n",
                "## Action Plan\nNone found.\n",
            ),
            True,
        ),
        "benign secret prose": (
            valid.replace(
                "- INFERRED: A bounded operational risk remains.",
                "- INFERRED: Secret: rotation is owned by operations.",
            ),
            False,
        ),
        "unexpected section": (
            valid.replace("## Decision", "## Surprise\nText\n## Decision"),
            True,
        ),
        "fenced schema copy": (valid + f"\n```markdown\n{valid}\n```\n", True),
    }
    for name, (report, should_fail) in cases.items():
        failed = bool(validate(report, run_gitleaks=False))
        if failed != should_fail:
            print(f"self-test failed: {name}", file=sys.stderr)
            return 1

    constructed_secrets = {
        "Telegram bot token": "123456789" + ":" + ("A" * 35),
        "GitHub token": "ghp_" + ("A1b2C3d4E5" * 4),
        "Slack token": "xoxb-" + ("A1b2C3d4E5" * 3),
        "AWS access key": "AKIA" + ("A1B2C3D4" * 2),
        "JWT": "eyJ" + ("A" * 10) + ".eyJ" + ("B" * 10) + "." + ("C" * 10),
        "database URI": "postgresql://report_user:" + ("S" * 12) + "@db.invalid/report",
    }
    for name, value in constructed_secrets.items():
        secret_report = valid.replace(
            "- VERIFIED: A source test passed.",
            f"- VERIFIED: A source test leaked {value}",
        )
        secret_errors = validate(secret_report, run_gitleaks=False)
        if not any(
            error.startswith("possible secret exposed:") for error in secret_errors
        ):
            print(f"self-test failed: detector missed {name}", file=sys.stderr)
            return 1

    if scan_with_gitleaks(valid):
        print("self-test failed: Gitleaks rejected the valid fixture", file=sys.stderr)
        return 1

    print("self-test passed")
    return 0


def read_report(path: Path) -> tuple[str | None, str | None]:
    try:
        if not path.is_file():
            return None, "report path is not a regular file"
        if path.stat().st_size > MAX_REPORT_BYTES:
            return None, f"report exceeds {MAX_REPORT_BYTES} bytes"
        return path.read_text(encoding="utf-8"), None
    except (OSError, UnicodeError) as error:
        return None, f"cannot read report: {error.__class__.__name__}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", nargs="?", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if args.report is None:
        parser.error("report is required unless --self-test is used")

    text, read_error = read_report(args.report)
    if read_error is not None:
        print(f"ERROR: {read_error}", file=sys.stderr)
        return 2
    assert text is not None

    errors = validate(text)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(f"valid council report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
