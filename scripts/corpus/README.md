Purpose:
  Offline corpus pipeline for building global clustered position universe.
  Raw external evaluated positions -> normalized candidate rows -> feature rows -> clusters -> hot pool.

Inputs:
  - ~/Downloads/lichess_db_eval.jsonl.zst (Lichess eval DB, billions of positions)
  - cache/corpus/lichess_eval_sample.jsonl (normalized sample from ingest script)

Pipeline steps:
  Step 1: Ingest Lichess eval DB
    Script: scripts/corpus/ingest_lichess_eval.py
    Output: cache/corpus/lichess_eval_sample.jsonl
    Command: python scripts/corpus/ingest_lichess_eval.py --input ~/Downloads/lichess_db_eval.jsonl.zst.part --output cache/corpus/lichess_eval_sample.jsonl --limit 100000

  Step 2: Extract V0 features
    Script: scripts/corpus/extract_position_features.py
    Output: cache/corpus/lichess_eval_features.jsonl, cache/corpus/feature_vector_v0_keys.json
    Command: python scripts/corpus/extract_position_features.py --input cache/corpus/lichess_eval_sample.jsonl --output cache/corpus/lichess_eval_features.jsonl --limit 100000

  Step 3: Validate JSONL
    Script: scripts/corpus/validate_corpus_jsonl.py
    Command: python scripts/corpus/validate_corpus_jsonl.py --input cache/corpus/lichess_eval_features.jsonl --kind features --limit 10000

  Step 4: Future clustering (not yet implemented)
    Input: cache/corpus/lichess_eval_features.jsonl
    Output: cache/corpus/lichess_eval_clusters.jsonl, cache/corpus/cluster_summary_v0.json

  Step 5: Future hot pool export (not yet implemented)
    Output: positions ready for blindspot training serving

Why cache outputs are not committed:
  - .jsonl files in cache/corpus/ are gitignored (too large for git)
  - giant Lichess .zst / .zst.part files are gitignored
  - .parquet files are gitignored

Dependencies:
  pip install zstandard chess

Notes:
  - .zst.part files can be used for small samples if download is still in progress
  - corpus outputs must never be committed to the repo