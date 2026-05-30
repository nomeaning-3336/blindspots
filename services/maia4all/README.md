# Maia4All service

This directory is reserved for the Maia4All-backed clone service.

Current blocker: the repository does not contain Maia4All source code or a
Maia4All checkpoint capable of producing the required 128-dimensional user
embedding and user-conditioned move policy.

The Next.js clone routes now require `MAIA4ALL_URL` and call:

- `POST /v1/embeddings/train`
- `POST /v1/move`

No placeholder embedding, move book, heuristic move selector, or random legal
move fallback is implemented here. Add the real Maia4All code/checkpoint before
starting this service.
