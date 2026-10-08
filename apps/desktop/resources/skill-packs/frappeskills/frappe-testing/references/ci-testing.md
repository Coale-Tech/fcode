# CI Testing

> Adopted from [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills) (MIT) — `testing/references/ci-testing.md`.
> Versions below match Frappe's own `.github/workflows/_base-server-tests.yml` and
> `.github/actions/setup/action.yml` for framework 16.35.0.

## Overview
Configure continuous integration to run Frappe tests automatically on every commit.

`bench run-tests` is a `unittest`-based runner (`frappe/testing/runner.py`), not pytest — it
does not understand pytest markers (`-m "not slow"`) or `pytest.ini`. Filter what runs with
`--test-category`, `--case`, `--test`, `--module`, or `--doctype` instead (see
[references/testing.md](testing.md)).

## GitHub Actions

### Basic Workflow
```yaml
## .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mariadb:
        image: mariadb:11.8
        env:
          MYSQL_ROOT_PASSWORD: root
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3

    steps:
      - uses: actions/checkout@v6

      - name: Setup Python
        uses: actions/setup-python@v6
        with:
          python-version: '3.12'

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: '24'

      - name: Install Bench
        run: pip install frappe-bench

      - name: Install redis
        run: sudo apt-get install -y redis-server

      - name: Init Bench
        run: |
          bench init --skip-assets frappe-bench
          cd frappe-bench
          bench get-app ${{ github.workspace }}

      - name: Create Test Site
        run: |
          cd frappe-bench
          bench new-site --db-root-password root --admin-password admin test_site
          bench --site test_site install-app my_app
          bench --site test_site set-config allow_tests 1 --parse

      - name: Run Tests
        run: |
          cd frappe-bench
          bench --site test_site run-tests --app my_app --coverage

      - name: Upload Coverage
        uses: codecov/codecov-action@v5
        with:
          files: ./frappe-bench/sites/coverage.xml
```

Frappe's own CI installs `redis-server` as a system package rather than a `services:` container
(`.github/actions/setup/action.yml`), and lets `bench start`/`bench serve` manage the process —
either approach works, a `services:` Redis container is simpler for a single-app CI job.
The minimum supported Python for v16 is `3.14` (`>=3.14,<3.15`, `pyproject.toml`); `3.12` above
is a widely-supported floor for third-party apps still targeting v15 (`>=3.10,<3.15`) — pin to
whatever your `pyproject.toml`/`hooks.py` `required_apps` actually support.

### Matrix Testing (Multiple Versions)
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.12', '3.13', '3.14']
        frappe-branch: ['version-15', 'version-16']
      fail-fast: false

    steps:
      - name: Setup Python
        uses: actions/setup-python@v6
        with:
          python-version: ${{ matrix.python-version }}

      - name: Init Bench
        run: |
          bench init --frappe-branch ${{ matrix.frappe-branch }} frappe-bench
```

### Caching Dependencies
```yaml
      - name: Cache pip
        uses: actions/cache@v4
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
          restore-keys: ${{ runner.os }}-pip-

      - name: Cache node modules
        uses: actions/cache@v4
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

## GitLab CI

```yaml
## .gitlab-ci.yml
image: python:3.12

services:
  - mariadb:11.8
  - redis:alpine

variables:
  MYSQL_ROOT_PASSWORD: root
  MYSQL_DATABASE: test_frappe

stages:
  - test

test:
  stage: test
  before_script:
    - pip install frappe-bench
    - bench init --skip-assets frappe-bench
    - cd frappe-bench
    - bench get-app $CI_PROJECT_DIR
    - bench new-site --db-root-password root --admin-password admin test_site
    - bench --site test_site install-app my_app
    - bench --site test_site set-config allow_tests 1 --parse
  script:
    - cd frappe-bench
    - bench --site test_site run-tests --app my_app
```

## CircleCI

```yaml
## .circleci/config.yml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/python:3.12
      - image: mariadb:11.8
        environment:
          MYSQL_ROOT_PASSWORD: root
      - image: redis:alpine

    steps:
      - checkout
      - run:
          name: Wait for MariaDB
          command: dockerize -wait tcp://127.0.0.1:3306 -timeout 60s
      - run:
          name: Install and Test
          command: |
            pip install frappe-bench
            bench init frappe-bench
            cd frappe-bench
            bench get-app ~/project
            bench new-site --db-root-password root test_site
            bench --site test_site install-app my_app
            bench --site test_site set-config allow_tests 1 --parse
            bench --site test_site run-tests --app my_app

workflows:
  test_workflow:
    jobs:
      - test
```

## Test Configuration

### Coverage Configuration
```ini
## .coveragerc
[run]
source = my_app
omit =
    */test_*.py
    */tests/*
    */__pycache__/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise NotImplementedError
```

`bench run-tests --coverage` drives `frappe.coverage.CodeCoverage`, which writes an XML report
under `sites/`; `.coveragerc` still applies since it wraps stdlib `coverage.py`.

## Parallel Testing

`bench run-parallel-tests` splits an app's test files by weight across shards
(`frappe/parallel_test_runner.py`) — there is no `--split` flag on `run-tests`. This mirrors
Frappe's own matrix in `.github/workflows/_base-server-tests.yml`:

```yaml
jobs:
  test:
    strategy:
      matrix:
        index: [1, 2, 3, 4]
    steps:
      # ... setup steps ...
      - name: Run Tests (parallel)
        run: |
          cd frappe-bench
          bench --site test_site run-parallel-tests --app my_app \
            --build-number ${{ matrix.index }} --total-builds 4
```

## UI Tests in CI

```yaml
  ui-test:
    runs-on: ubuntu-latest
    needs: test

    steps:
      # ... setup steps (bench init, create test site) ...

      - name: Start Bench
        run: |
          cd frappe-bench
          nohup bench start &> bench_start.log &

      - name: Site Setup
        run: |
          cd frappe-bench
          bench --site test_site execute frappe.utils.install.complete_setup_wizard
          bench --site test_site execute frappe.tests.ui_test_helpers.create_test_user

      - name: Run UI Tests
        run: |
          cd frappe-bench
          bench --site test_site run-ui-tests my_app --headless

      - name: Upload Screenshots
        if: failure()
        uses: actions/upload-artifact@v6
        with:
          name: cypress-screenshots
          path: frappe-bench/apps/my_app/cypress/screenshots
```

`run-ui-tests` does **not** start the site itself — it only computes `CYPRESS_baseUrl` from
`frappe.utils.get_site_url` and shells out to the cypress binary (`frappe/commands/testing.py`,
`run_ui_tests`). The site must already be serving requests; Frappe's own CI starts it with
`bench start &> bench_start.log &` during setup, well before the UI test job runs
(`.github/actions/setup/action.yml`) — include an equivalent step, as above.
`create_test_user` is a real whitelisted helper in `frappe/tests/ui_test_helpers.py`; use it
(or an app-specific equivalent) to provision a non-Administrator user Cypress can `cy.login()`
as.

## Conditional Testing

```yaml
      - name: Get Changed Files
        id: changed
        uses: tj-actions/changed-files@v39
        with:
          files: |
            *.py
            *.js

      - name: Run Tests
        if: steps.changed.outputs.any_changed == 'true'
        run: bench --site test_site run-tests --app my_app
```

## Notifications

```yaml
      - name: Notify Slack on Failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Tests failed on ${{ github.ref }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "Tests failed in *${{ github.repository }}*"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Best Practices

1. **Run tests on every PR** — Catch issues before merge
2. **Use caching** — Speed up builds with dependency caching
3. **Parallel testing** — Split tests across multiple runners with `run-parallel-tests`
4. **Test matrix** — Test against multiple Python/Frappe versions
5. **Upload artifacts** — Save logs and screenshots on failure
6. **Set timeouts** — Prevent hung builds from blocking pipeline

## Sources

Verified against Frappe v16.35.0 (`frappe/__init__.py` `__version__`):

- `apps/frappe/frappe/commands/testing.py` — `run-tests`/`run-parallel-tests`/`run-ui-tests` CLI flags and behavior
- `apps/frappe/frappe/parallel_test_runner.py` — `run-parallel-tests` sharding
- `apps/frappe/frappe/tests/ui_test_helpers.py` — `create_test_user`
- `apps/frappe/pyproject.toml` — `requires-python = ">=3.14,<3.15"`
- `apps/frappe/.github/workflows/_base-server-tests.yml`, `apps/frappe/.github/workflows/_base-ui-tests.yml`, `apps/frappe/.github/actions/setup/action.yml` — Frappe's own CI matrix, redis-server install, `bench start &` ordering before UI tests
