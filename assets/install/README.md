# `aoox install` assets

Copies of `aoox-api`'s distribution compose files, bundled here so
`aoox install` works on a bare VPS without any network access to that repo.

- `docker-compose.dist.yml`
- `docker-compose.domain.yml`

**Keep these in sync by hand** when the source files change — there is no
automated check for drift yet.

`aoox reinstall` also reads these copies (it rewrites an existing install's compose
files from them and derives which `.env.dist` keys it may add from their `${VAR}`
references) — so a stale copy here means stale repairs, too.
