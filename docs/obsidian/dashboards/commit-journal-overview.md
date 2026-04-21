# Commit Journal Overview

```dataview
TABLE default(display_name, project) AS name, project AS slug, commit_short, author, committed_at, file.link AS journal
FROM ""
WHERE type = "commit-journal"
SORT committed_at DESC
LIMIT 100
```

## By Project

```dataview
TABLE length(rows) AS commits
FROM ""
WHERE type = "commit-journal"
GROUP BY project
SORT commits DESC
```
