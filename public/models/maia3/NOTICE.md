# Maia3-5M Browser Model

- Model name: Maia3-5M
- Source project: CSSLab/maia3
- Official source commit SHA: `1e13597c42d4858b7cfd7cfdae01e297263364b2`
- Official source/model license: AGPL-3.0
- Source checkpoint SHA-256: `ba14208b2992d85502f5fb501934abf6aaaeb355e9f3fdf90e326911f562524f`
- Source checkpoint byte size: `20968049`
- Exported ONNX SHA-256: `fa2a685b6426526f6b371eb1e4cf19bbe2e3443a03bfc1e09c34fa49daf54199`
- Exported ONNX byte size: `21260170`

This ONNX artifact was generated from the official Maia3-5M checkpoint for browser inference.

The successful browser artifact used the spike-local export compatibility adjustment documented in `qa-artifacts/maia3-feasibility/results/summary.md`: legacy TorchScript ONNX export with `dynamo=false` and RMSNorm decomposed into primitive arithmetic during export. Vendored Maia3 source was not modified.
