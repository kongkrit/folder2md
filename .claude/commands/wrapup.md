---
description: Write session handoff to PROGRESS.md and commit
allowed-tools: Bash(git add:*), Bash(git commit:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git show:*)
---
Rewrite PROGRESS.md as a handoff for the work since the previous handoff, not a running history.

1. Base: `git log -1 --format=%h -- PROGRESS.md`, the commit that wrote the previous handoff. Cover `git log <base>..HEAD`, uncommitted changes (`git status`, `git diff HEAD`), and decisions or findings from this session that left no commit.
2. Rewrite PROGRESS.md: keep the title; the intro line names the base ("Covers the work after `<base>`; earlier handoffs: `git log -p -- PROGRESS.md`.").
   - What we did: only the work from step 1. Replace the previous list, never append to it.
   - Current state: a snapshot as of now (tests, branch and push state, what is verified and what is not).
   - Next steps, Open questions: carry over what is still open, drop what is done or answered, add new items.
3. Stage and commit with a conventional-commit message. That commit becomes the next handoff's base.
