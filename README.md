# envdiff

Compare two `.env` files key by key and catch the drift that breaks a deploy — a missing key in
production, a value that never got rotated, a variable only one environment has.

```
$ envdiff .env.example .env.production
envdiff: .env.example vs .env.production

  missing in .env.production (2):
    - STRIPE_WEBHOOK_SECRET
    - REDIS_URL
  different values (1):
    ~ API_KEY: "sk-abc***xyz" -> "sk-def***uvw"

  14 identical, 1 changed, 2 missing, 0 extra
$ echo $?
1
```

Zero dependencies, Node 18+, one file.

## Install

```bash
# run it directly
npx envdiff-cli .env.example .env

# or clone and link
git clone https://github.com/pscly1/envdiff && cd envdiff && npm link
```

## Usage

```
envdiff <fileA> <fileB> [options]

  --reveal          show real values instead of masking secrets
  --json            machine-readable output (same as --format json)
  --format <fmt>    text (default), json, or github action annotations
  --only-missing    exit 1 only for keys missing on one side (ignore value drift)
  --keys <a,b>      restrict the comparison to these keys
  --version         print version
  -h, --help        this message
```

### Exit codes — the useful part

| code | meaning |
| --- | --- |
| `0` | in sync |
| `1` | drift detected |
| `2` | usage error or unreadable file |

That makes it drop straight into CI:

```yaml
- name: check env parity
  run: npx envdiff-cli .env.example .env.staging --only-missing
```

`--only-missing` is what you usually want in CI: staging is *supposed* to have different values,
but it must not have different *keys*.

### GitHub Actions annotations

`--format github` prints `::error` / `::warning` workflow commands, so a missing key shows up
inline on the PR diff instead of hiding in a log:

```yaml
- run: npx envdiff-cli .env.example .env.production --format github
```

### As a library

```js
const { parseDotenv, diffEnv, formatReport } = require('envdiff-cli');
const d = diffEnv(parseDotenv(a), parseDotenv(b), '.env.example', '.env');
console.log(d.onlyLeft, d.changed);
```

## What it actually parses

Real `.env` files are messier than `key=value`:

```dotenv
# comment, skipped
export DATABASE_URL=postgres://localhost/dev
QUOTED="a value with spaces"
SINGLE='literal \n stays'
INLINE=bare # this trailing comment is dropped
EMPTY=
BASE64=Zm9v==bar
```

All of the above round-trip correctly, including CRLF line endings and `=` inside values.

## Secret masking

Keys matching `SECRET`, `TOKEN`, `PASSWORD`, `PASSWD`, `API_KEY`, `PRIVATE`, `CREDENTIAL`, `_KEY`,
or a bare `KEY` are masked in output by default — enough to see *that* a value changed, not enough
to leak it into a CI log. `--reveal` turns masking off when you are on your own machine.

Masking is a safety default, **not** a security boundary: `--json` and `--reveal` print real values.

## Tests

```bash
npm test
```

Eighteen cases over the parser, the differ, masking, and the CLI's exit codes — each one spawns the
actual binary, so the exit-code contract is tested for real rather than mocked.

## License

MIT
