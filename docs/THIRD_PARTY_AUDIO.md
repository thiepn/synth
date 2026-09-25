# Third-party audio

Synth includes a curated subset of the Fischer TR-808 sample set from
`tidalcycles/sounds-tr808-fischer`.

- Upstream repository: https://github.com/tidalcycles/sounds-tr808-fischer
- Pinned commit: `85fbecf1bec32553395625ea659e2a56dfd7c0e1`
- License: CC0 1.0 Universal
- Upstream license: https://github.com/tidalcycles/sounds-tr808-fischer/blob/main/LICENSE
- Integration: build-time download with Git blob SHA and byte-length verification.

The generated WAV files are intentionally not committed to this repository.
`scripts/fetch-cc0-samples.mjs` downloads only the eight files listed in
`public/samples/cc0-manifest.json`. This keeps source control lean while
making the deployed build self-contained.
