# Local validation workflow

The scientist training page defaults to **Train / Validation / Test** after aggregation and saved lag-feature generation. The reference Train/Test workflow remains available through its own button.

1. Choose whole recording days (recommended) or whole sessions, in chronological order. Default group shares are 50% Train, 25% Validation, with the remainder Test. Counts apply to groups that actually have eligible samples. With four eligible days the allocation is 2 / 1 / 1; missing sessions can make sample shares differ.
2. Review and freeze 2–20 distinct configurations. The default list has 15 distinct candidates (C1–C15); these are new candidate labels, not the historical Ex identifiers. All candidates evaluate horizons 1, 3, 5. The default search varies trees, depth, leaf size, and minimum split size; seed 42, bootstrap and all five lag features are fixed in the UI.
3. Run candidates. Only Train fits models and the Historical Average baseline. Only Validation scores select configurations. Candidate models/results are kept inside the validation workflow and excluded from the ordinary experiment list and prediction workflow.
4. Once all candidates complete, finalize. Lowest mean Validation RMSE across the three horizons wins, with mean Validation MAE and candidate order as deterministic tie breakers. This is selection within one batch, not an across-batch global search.
5. Selection freezes before reading Test for scoring. New forests are fitted on Train + Validation; Historical Average is recalculated on that same union. All three methods score the same held-out Test samples. Repeated Finalize returns the saved result rather than retraining.

Both temporal boundaries enforce `max(earlier target time) < min(later history start time)`. Samples never cross session boundaries. Old results are not overwritten. A new migration adds `lag_feature_splits.purpose` and `validation_studies`; reserved splits cannot be used through ordinary training endpoints or replace the latest reference split.

## Docker

Run `docker compose up -d` from the repository root. The local backend startup applies only four reviewed, idempotent migrations (browser sessions, share recipients, isolated upload batches, validation studies) before starting Uvicorn. This updates an existing initialized local database; it does not replay historical migrations or reset data. Backend source, migration files and Vite frontend source are mounted locally. The production image startup is unchanged; this feature has not been pushed or deployed to the public server.

Open http://localhost:5173, sign in as Data Scientist, choose a batch, then open its training page. The saved Docker smoke run belongs to the seeded scientist account and uses existing local data; its test data was marked previously used.

For the current restored local fixture, start with `./BE/scripts/start_local.ps1` (or pass `-DatasetDir` with your CSV folder). It uses `compose.dataset.yml`, mounts original CSVs read-only under the upload root and keeps new uploads on local storage. If the existing user AWS profile directory is available, it also mounts that directory read-only through `compose.s3.yml` so historical S3 references remain readable. Keep these overrides when recreating containers: a plain Compose recreation would omit their mounts. Restarting the existing containers in Docker Desktop preserves their mounts.

The local drone-1 and drone-3 fixtures were repaired against current server references after checking recording filenames, available checksums and normalized row counts. Verified normalized files were downloaded into the Docker upload volume cache. Only local references/cache were updated; server data was unchanged. Original references were backed up under `local-recovery` in the Docker upload volume. Drone-3 original CSV checksums were also checked against the local source folder.

The one-off `BE/scripts/restore_local_fixture.py` repairs missing local fixture file references by checking original CSV SHA-256 values, saving the old references in the upload volume, rebuilding Parquet using the existing normalization writer, and verifying its row count before updating each dataset. It never uploads, deletes, or rewrites an S3 object. Run it only in the local storage configuration after making the original CSVs available.

## Interpretation and operation

Previously inspected Test data stays previously inspected even after introducing validation. The default checkbox records this fact. An unchecked box records a user declaration of unused holdout, not a verified claim of independence. Creating another study on the same data does not make the holdout new.

Validation runs one candidate per request. Closing the page stops dispatching subsequent candidates; reopen the saved study to continue. The current synchronous candidate finishes on the backend. A process crash during a running candidate/finalization requires inspecting the persisted experiment and study state before maintenance recovery; the workflow deliberately does not automatically repeat a final Test evaluation. A failed final evaluation keeps the selection frozen.
