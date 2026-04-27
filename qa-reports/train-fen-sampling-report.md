# Train FEN Sampling Findings

Generated: 2026-04-27T18:01:52.406Z

Total samples: 30

Total playthrough plies: 0


## Test Mode


`api-sampling-plus-mocked-ui-replay` — UI assertions replay a captured API response via route mock.

`real-page-owned` — UI assertions use the page's own live API response (no route mock).


**Note:** Direct `/api/train/next-position` sampling mutates queues and recent serve history.

Run only with a dedicated QA account, not a production profile.


## Critical Failures

- [HIGH] recommender_warning (completed_sequence_count_static): completedSequenceCount was 2 for all samples. chooseServeMode will see the same profile state unless complete-sequence is called. QA loop does not call complete-sequence, so this is expected but should be noted.
  Stage: profile_state, Expected: (grows with complete-sequence calls), Actual: (1 unique value across 30 samples)
- [HIGH] recommender_warning (recent_served_modes_not_growing): recent_served_modes count did not grow after initial load. Persistence may be broken.
  Stage: persistence, Expected: (increases), Actual: (50 → 50)

## Distribution


### Serve Mode

- endgame: 2
- middlegame: 20
- opening: 5
- tactic: 3

### Phase

- endgame: 2
- middlegame: 20
- opening: 5
- tactic: 3

### Bucket

- endgame_rook: 1
- endgame_pawn: 1
- middlegame: 20
- opening: 4
- tactic: 3
- opening_development: 1

### Source

- elite: 30

### Test Mode

- api-sampling-plus-mocked-ui-replay: 30

### Tactic: yes=3 no=27

### API invalid FEN: 0

### UI board FEN unreadable: 24

### UI board mismatch (verified but wrong): 6

### Terminal/checkmate: 0


## Sample Table


sample | testMode | serveMode | phase | bucket | source | apiValid | uiVerified | clientMatch | terminal | screenshot

---|---|---|---|---|---|---|---|---|---|---|---
1 | mock | endgame | endgame | endgame_rook | elite | true | true | false | false | yes
2 | mock | endgame | endgame | endgame_pawn | elite | true | true | false | false | yes
3 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
4 | mock | opening | opening | opening | elite | true | false | false | false | yes
5 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
6 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
7 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
8 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
9 | mock | tactic | tactic | tactic | elite | true | true | false | false | yes
10 | mock | tactic | tactic | tactic | elite | true | true | false | false | yes
11 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
12 | mock | tactic | tactic | tactic | elite | true | true | false | false | yes
13 | mock | opening | opening | opening | elite | true | false | false | false | yes
14 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
15 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
16 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
17 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
18 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
19 | mock | opening | opening | opening_development | elite | true | true | false | false | yes
20 | mock | opening | opening | opening | elite | true | false | false | false | yes
21 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
22 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
23 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
24 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
25 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
26 | mock | opening | opening | opening | elite | true | false | false | false | yes
27 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
28 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
29 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes
30 | mock | middlegame | middlegame | middlegame | elite | true | false | false | false | yes

## All Findings


### recommender_warning [medium] (only_elite_source)

Stage: api_response

Expected: (seed + elite sources)

Actual: (only elite)

Notes: All 30 positions came from elite source. Opening/tactic seed sources were not observed. This may indicate seed-path bypass or empty seed pools.

### recommender_warning [high] (completed_sequence_count_static)

Stage: profile_state

Expected: (grows with complete-sequence calls)

Actual: (1 unique value across 30 samples)

Notes: completedSequenceCount was 2 for all samples. chooseServeMode will see the same profile state unless complete-sequence is called. QA loop does not call complete-sequence, so this is expected but should be noted.

### recommender_warning [high] (recent_served_modes_not_growing)

Stage: persistence

Expected: (increases)

Actual: (50 → 50)

Notes: recent_served_modes count did not grow after initial load. Persistence may be broken.
