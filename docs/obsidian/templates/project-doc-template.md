---
type: project-doc
project: <% tp.file.folder(true).split("/").slice(-2, -1)[0] %>
source_repo: ""
updated_at: <% tp.date.now("YYYY-MM-DDTHH:mm:ss") %>
tags: [project-doc]
links:
  - "[[<project>/docs/README]]"
---

# <% tp.file.title %>

## Summary
- Purpose:
- Scope:

## Related Project
- Hub note file name follows `.obsidian-ingest.json`: optional `hubFileStem`, else sanitized `displayName`, else `<slug>-docs-hub`. After `sync-docs`, link like `[[<project>/docs/<slug>-docs-hub]]` (replace `<project>` and `<slug>` with your vault folder and ingest `slug`).

## Decisions
- 

## Next Actions
- 
