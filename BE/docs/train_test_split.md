# Train/Test Split – Backend

## Persisted Lag Feature split APIs

Three endpoints are grouped under the separate Swagger tag **Train/Test Split**:

- `POST /api/train-test-splits`: create or reuse a saved split.
- `GET /api/train-test-splits/{split_id}`: read its configuration, samples and sessions.
- `GET /api/train-test-splits/{split_id}/preview`: page through TRAIN or TEST samples.

Create a split from a completed Feature Generation:

```json
{
  "feature_generation_id": "49344733-e6b7-4cfc-93c0-de3ab797013c",
  "split_strategy": "DAY_BASED",
  "train_ratio": 0.7,
  "shuffle": false,
  "forecast_horizons": [1, 3, 5]
}
```

`DAY_BASED` is the default. It keeps all samples from a recording date together,
assigning earlier dates to Train and later dates to Test. `SESSION_BASED` keeps
each Recording Session together and orders Sessions by their first sample time.
Shuffling is not supported. The actual ratio is computed from sample counts and
can differ from the requested ratio when whole dates or Sessions are retained.

The split is deterministic and idempotent for a Feature Generation and
configuration. Before saving, the API checks that the latest Train target time
precedes the earliest Test feature-history time. It returns
`TRAIN_TEST_DATA_LEAKAGE` and saves nothing if that check fails. It never
rebuilds Lag Features or trains a model.

Preview accepts `subset=TRAIN|TEST`, `page`, `page_size`, and an optional
`session_id`:

```text
/api/train-test-splits/{split_id}/preview?subset=TEST&page=1&page_size=20
```

To train vehicle-count Random Forest models, submit the saved `split_id` and
configuration to `POST /api/model-training/experiments`. The backend manages
the experiment Batch internally. Each experiment uses the saved memberships
and evaluates all three horizons without re-splitting.

Apply `migrations/20261121_lag_feature_generation.sql` and
`migrations/20261122_persistent_train_test_splits.sql` before using these APIs
on an existing PostgreSQL database.

## Removed legacy endpoint

`POST /api/train-test-split/training` has been removed from the API and Swagger.
The former Feature Engineering endpoints it depended on are also removed. The
legacy request-based split implementation is not part of the current HTTP API.
