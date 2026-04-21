# Daily Log Overview

```dataview
TABLE project, updated_at, file.link AS log
FROM "daily"
WHERE type = "daily-log"
SORT file.day DESC
LIMIT 30
```

## Journals for Recent 7 Days

```dataview
TABLE default(display_name, project) AS name, project AS slug, commit_short, committed_at, file.link AS journal
FROM ""
WHERE type = "commit-journal" AND date(committed_at) >= date(today) - dur(7 days)
SORT committed_at DESC
```
