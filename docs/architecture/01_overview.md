# Architecture overview

## Product boundary

FrothSeg has four cooperating surfaces:

| Surface | Location | Responsibility |
|---|---|---|
| Data and science | `data-pipeline/fslab` | image contracts, synthetic stills, persistent-ID sequences, C1-C7 algorithms, metrics |
| Model lifecycle | `data-pipeline/fslab/learning`, `foundation` | CUDA training, calibration, inference, official-engine adapters, ONNX export |
| Evidence and release | `scripts`, `models`, `data/derived` | run manifests, checksums, held-out results, temporal reports, unified release gate |
| Companion web | `frontend` | replay selected cases and evidence; bounded live classical and SlimSAM interaction |

The optional FastAPI package serves static content contracts when a hosted
backend is useful. The default public deployment remains static.

## End-to-end flow

```text
condition matrix + seeds
        |
        v
exact geometry groups + appearance variants + temporal ids
        |
        v
group-isolated train / validation / calibration / test manifest
        |
        v
checksum-pinned local cache
        |
        +--> C1-C7 offline benchmark
        |
        +--> L1-L4, L6, N1 training --> calibration --> test --> export
        |
        +--> L5, L7 official checkpoints --> test --> temporal/video
        |
        v
canonical 13-case diagnostic + unified method benchmark
        |
        v
release inventory + compact companion-web artifacts
```

No training or full benchmark is moved into the browser. That work requires
Python CV libraries, official research runtimes, large checkpoints, and CUDA.
The website reads versioned results and offers only interactions that are
technically valid within browser constraints.

## Data separation

The v2 learned dataset contains 192 latent geometry groups and two appearance
variants per group. A group belongs to exactly one split. This prevents two
renderings of the same bubble geometry from leaking across train, validation,
calibration, or the untouched test split.

The 13 canonical cases are a readable diagnostic suite, not the primary test.
They make failure modes visible across glare, motion, defocus, loading, bubble
scale, empty input, and mixed distributions.

## Method ladder

- C1-C7 are classical and transparent.
- L1-L4 and L6 are domain-learned methods.
- L5 and L7 are official foundation-model integrations.
- N1 is a frontier hypothesis whose first version failed.

Implementation acceptance and quality acceptance are separate. A method can be
fully implemented yet below the current AP bar. That distinction prevents
missing code from being disguised as a negative scientific result, and prevents
a negative result from being hidden.
