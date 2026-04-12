---
name: 'Update changelog'
on:
    push:
        branches:
            - master
        paths:
            - 'docs/**'
            - 'docs.json'
context:
    - repo: 'GP-CRM-System/E-Commerce-CRM'
automerge: true
---

# Agent Instructions

When this workflow triggers after documentation changes:

1. Fetch recent commits from the source repo that modified docs/
2. Generate a changelog entry summarizing:
    - New documentation pages added
    - Existing pages updated
    - API endpoints added/modified
3. Format as markdown and create/update CHANGELOG.md in the docs repo
