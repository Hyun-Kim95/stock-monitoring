---
type: daily-log
project: <% tp.frontmatter.project || "general" %>
source_repo: ""
updated_at: <% tp.date.now("YYYY-MM-DDTHH:mm:ss") %>
tags: [daily-log]
links:
  - "[[dashboards/projects-overview]]"
  - "[[dashboards/commit-journal-overview]]"
---

# <% tp.date.now("YYYY-MM-DD") %> Daily Log

## Today Summary
- 

## Related Journals
```dataview
TABLE project, commit_short, committed_at
FROM ""
WHERE type = "commit-journal" AND date(committed_at) = date(this.file.day)
SORT committed_at DESC
```

## Related Project Docs
```dataview
TABLE project, updated_at
FROM ""
WHERE type = "project-doc"
SORT updated_at DESC
LIMIT 10
```

## Next Actions
- 
