# Train FEN Sampling Findings

Generated: 2026-04-29T12:27:35.911Z

Total samples: 30

Total playthrough plies: 0


## Test Mode


`api-sampling-plus-mocked-ui-replay` — UI assertions replay a captured API response via route mock.

`real-page-owned` — UI assertions use the page's own live API response (no route mock).


**Note:** Direct `/api/train/next-position` sampling mutates queues and recent serve history.

Run only with a dedicated QA account, not a production profile.


## Critical Failures

- [HIGH] recommender_warning (no_tactic_injection): No tactic positions were served across 30 samples. Tactic injection may not be working.
  Stage: api_response, Expected: (some tactic serves), Actual: (no tactic serves)
- [HIGH] recommender_warning (completed_sequence_count_static): completedSequenceCount was -1 for all samples. chooseServeMode will see the same profile state unless complete-sequence is called. QA loop does not call complete-sequence, so this is expected but should be noted.
  Stage: profile_state, Expected: (grows with complete-sequence calls), Actual: (1 unique value across 30 samples)

## Distribution


### Serve Mode

- : 30

### Phase

- : 30

### Bucket

- : 30

### Source

- : 30

### Test Mode

- api-sampling-plus-mocked-ui-replay: 30

### Tactic: yes=0 no=30

### API invalid FEN: 30

### UI board FEN unreadable: 30

### UI board mismatch (verified but wrong): 0

### Terminal/checkmate: 0


### Repeated FENs

- 30x: 

## Sample Table


sample | testMode | serveMode | phase | bucket | source | apiValid | uiVerified | clientMatch | terminal | screenshot

---|---|---|---|---|---|---|---|---|---|---|---
1 | mock |  |  |  |  | false | false | false | false | no
2 | mock |  |  |  |  | false | false | false | false | no
3 | mock |  |  |  |  | false | false | false | false | no
4 | mock |  |  |  |  | false | false | false | false | no
5 | mock |  |  |  |  | false | false | false | false | no
6 | mock |  |  |  |  | false | false | false | false | no
7 | mock |  |  |  |  | false | false | false | false | no
8 | mock |  |  |  |  | false | false | false | false | no
9 | mock |  |  |  |  | false | false | false | false | no
10 | mock |  |  |  |  | false | false | false | false | no
11 | mock |  |  |  |  | false | false | false | false | no
12 | mock |  |  |  |  | false | false | false | false | no
13 | mock |  |  |  |  | false | false | false | false | no
14 | mock |  |  |  |  | false | false | false | false | no
15 | mock |  |  |  |  | false | false | false | false | no
16 | mock |  |  |  |  | false | false | false | false | no
17 | mock |  |  |  |  | false | false | false | false | no
18 | mock |  |  |  |  | false | false | false | false | no
19 | mock |  |  |  |  | false | false | false | false | no
20 | mock |  |  |  |  | false | false | false | false | no
21 | mock |  |  |  |  | false | false | false | false | no
22 | mock |  |  |  |  | false | false | false | false | no
23 | mock |  |  |  |  | false | false | false | false | no
24 | mock |  |  |  |  | false | false | false | false | no
25 | mock |  |  |  |  | false | false | false | false | no
26 | mock |  |  |  |  | false | false | false | false | no
27 | mock |  |  |  |  | false | false | false | false | no
28 | mock |  |  |  |  | false | false | false | false | no
29 | mock |  |  |  |  | false | false | false | false | no
30 | mock |  |  |  |  | false | false | false | false | no

## All Findings


### recommender_warning [high] (no_tactic_injection)

Stage: api_response

Expected: (some tactic serves)

Actual: (no tactic serves)

Notes: No tactic positions were served across 30 samples. Tactic injection may not be working.

### recommender_warning [high] (completed_sequence_count_static)

Stage: profile_state

Expected: (grows with complete-sequence calls)

Actual: (1 unique value across 30 samples)

Notes: completedSequenceCount was -1 for all samples. chooseServeMode will see the same profile state unless complete-sequence is called. QA loop does not call complete-sequence, so this is expected but should be noted.
