# Projects Overview

```dataview
TABLE default(display_name, project) AS name, project AS slug, source_repo, updated_at, file.link AS entry
FROM ""
WHERE type = "project-doc"
AND hub
SORT updated_at DESC
```

## Recent Docs

```dataview
TABLE default(display_name, project) AS name, project AS slug, updated_at, file.link AS note
FROM ""
WHERE contains(file.path, "/docs/")
AND !contains(file.path, "/templates/")
AND !contains(file.path, "/dashboards/")
AND !contains(file.name, "-template")
AND !hub
SORT file.mtime DESC
LIMIT 30
```
