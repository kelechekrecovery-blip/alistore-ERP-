# AliStore 3.0 Replacement Handoffs

## Purpose

The owner instructed that surfaces without a recoverable design should continue in
the latest AliStore 3.0 visual language. The generated `.dc.html` files in
`design_handoff_alistore/screens` are explicit **replacement references** for the
64 linked handoffs that were not present on this machine.

They are not presented as restored copies of the original Claude Design files.
Each file carries `data-generated-replacement="true"` and an HTML provenance note.

## Shared 3.0 contract

- dark glass workspace with `#0B0A08`, `#181410` and `#201B17` surfaces;
- coral primary actions (`#FF5B2E`), lime positive states (`#C6FF3D`), gold warnings;
- dense, scan-friendly desktop grid with a responsive single-column mobile layout;
- explicit loading, empty, error, permission, offline and audit states;
- server-authoritative business values and Event Ledger evidence remain separate from
  the visual reference.

## Generation

The replacements are generated deterministically from the registered missing-file
table in `DESIGN-CORPUS-RETIRE-PROPOSAL.md`:

```bash
node scripts/generate-design3-replacements.mjs
```

The generator never overwrites an existing handoff. If an original or owner-approved
replacement is supplied later, it takes precedence and the generated file is removed
or superseded in the traceability record.
