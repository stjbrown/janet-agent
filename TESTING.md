# Janet prerelease testing

This is the release-candidate gate for `janet-agent`. Preview releases use npm's `next` tag.

## Automated release gate

From a clean checkout with Node.js 22.13 or newer:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm pack:janet
```

Record the source revision and tarball checksum:

```bash
git rev-parse HEAD
JANET_VERSION="$(node -p 'require("./package.json").version')"
shasum -a 256 "artifacts/janet-agent-$JANET_VERSION.tgz"
git status --short
```

The working tree should remain clean except for ignored `dist/`, `skills/`, and `artifacts/`
outputs.

Before publishing, verify the tarball:

- contains `dist/`, all seven `skills/`, `README.md`, `OBSERVABILITY.md`, `LICENSE`, and `NOTICE`
- contains both `janet` and `ding` binaries pointing to `dist/main.js`
- reports the version in `package.json`
- contains no `src/`, `test/`, monorepo path, `workspace:*`, or local `file:` dependency
- clean-installs without the Agent Knowledge source repository

## Isolated installation

Use a temporary npm cache to avoid relying on machine-global npm state:

```bash
JANET_VERSION="$(node -p 'require("./package.json").version')"
JANET_INSTALL_DIR="$(mktemp -d /tmp/janet-install.XXXXXX)"
npm install \
  --cache "$JANET_INSTALL_DIR/npm-cache" \
  --prefix "$JANET_INSTALL_DIR" \
  "/path/to/janet-agent-$JANET_VERSION.tgz"

"$JANET_INSTALL_DIR/node_modules/.bin/janet" --version
"$JANET_INSTALL_DIR/node_modules/.bin/ding" --help
```

Create a separate disposable project:

```bash
JANET_PROJECT_DIR="$(mktemp -d /tmp/janet-project.XXXXXX)"
"$JANET_INSTALL_DIR/node_modules/.bin/janet" -C "$JANET_PROJECT_DIR"
```

Do not use `sudo npm install`.

## Minimum beta matrix

- [ ] Test the installed tarball in at least two clean user environments.
- [ ] Complete OpenAI browser OAuth in one environment and device OAuth in another.
- [ ] Confirm OAuth and model selection persist after restart.
- [ ] Complete init, ingest, cited query, lint, and visualize.
- [ ] Document a repository and confirm source, tests, configuration, and existing docs stay
  untouched while only the selected bundle changes.
- [ ] Refresh after a small source change, then confirm an unrelated change produces no knowledge
  edit.
- [ ] Confirm ordinary skill loading, reads, and workspace edits do not show approval gates.
- [ ] Confirm shell execution still requires approval and headless mode fails closed.
- [ ] Confirm Esc, Ctrl+C, and `/cancel` stop an active run without exiting Janet.
- [ ] Confirm observability is off by default with no trace database or OTLP request.
- [ ] Test metadata-only local tracing and one Phoenix or custom OTLP export.
- [ ] Record commit, package checksum, platform, Node version, provider, and result.

Anthropic OAuth, an API-key provider, Vertex AI, and Bedrock are valuable additional coverage but
do not block the first beta when their unverified status is documented.

## Deterministic lint contract

Create a minimal conformant bundle and run lint without a model:

```bash
mkdir -p "$JANET_PROJECT_DIR/knowledge"
printf '# Knowledge\n' > "$JANET_PROJECT_DIR/knowledge/index.md"
"$JANET_INSTALL_DIR/node_modules/.bin/janet" -C "$JANET_PROJECT_DIR" lint
```

Expected exit statuses:

- `0`: conformant
- `1`: nonconformant
- `2`: missing bundle, missing checker, malformed checker output, or another operational failure

Add a concept without frontmatter and confirm status `1`, then restore the bundle and confirm
status `0`. Repeat with a project path containing spaces.

## Runtime checks

### Startup and authentication

- Run `janet --version` and `janet --help` from the installed package.
- Start in an empty project and confirm the displayed paths stay inside it.
- Run `/auth`; a clean environment should show no credentials.
- Complete the selected OAuth flow, restart, and confirm authentication persists.

### Permissions and cancellation

- Ask Janet to initialize a wiki; ordinary skill and workspace operations should not prompt.
- Request a shell command; it should require explicit approval.
- Decline it, then allow command execution for the current session.
- Cancel active turns separately with Esc, Ctrl+C, and `/cancel`.
- Confirm a double Ctrl+C still exits.

### Complete lifecycle

Use a small source document with concrete facts and a date:

1. Initialize a bundle.
2. Ingest the source.
3. Ask a question requiring that source.
4. Verify the answer cites bundle concepts or provenance.
5. Run lint and inspect both deterministic and semantic findings.
6. Generate the visualization and verify the concepts appear.
7. Restart and confirm the thread and bundle remain available.

### Headless boundaries

Run a read-only query:

```bash
"$JANET_INSTALL_DIR/node_modules/.bin/janet" \
  -C "$JANET_PROJECT_DIR" \
  --model openai/gpt-5.6-sol \
  query "Summarize the bundle with citations" \
  --print
```

Confirm it does not modify the bundle. A task requiring shell execution must fail unless
`--allow-exec` is passed deliberately.

### Project isolation

Start Janet in a second disposable project and confirm:

- its bundle and thread are distinct
- it cannot expose the first project's files through workspace tools
- machine-wide OAuth remains available, as intended

### Observability

Confirm default-off behavior first. Then test metadata-only local history:

```bash
JANET_OBSERVABILITY=metadata \
JANET_OBSERVABILITY_BACKEND=local \
"$JANET_INSTALL_DIR/node_modules/.bin/janet" \
  -C "$JANET_PROJECT_DIR" \
  query "Summarize the bundle" \
  --print
```

Inspect `/traces` and confirm prompt and response bodies are absent. Test one Phoenix or custom
OTLP export and confirm endpoint status never reveals credentials or query parameters.

## Registry verification

After publishing under `next`, repeat the isolated install from the registry:

```bash
REGISTRY_INSTALL_DIR="$(mktemp -d /tmp/janet-registry.XXXXXX)"
npm install \
  --cache "$REGISTRY_INSTALL_DIR/npm-cache" \
  --prefix "$REGISTRY_INSTALL_DIR" \
  janet-agent@next

"$REGISTRY_INSTALL_DIR/node_modules/.bin/janet" --version
npm view janet-agent dist-tags versions --json
```

Do not promote Janet to `latest` until the public beta gate is complete.
