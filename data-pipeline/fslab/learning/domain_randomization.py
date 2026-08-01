"""Domain-randomized training augmentation for the pre-registered P-2 study.

Pre-registration: CAOS_MANAGE
``plans/frothseg/research-2026-07-31/p2-domain-randomization-preregistration-2026-08-01.md``,
which fixes the element list in section 5 before any run. This module implements that list and
nothing beyond it.

Two things separate this from the mild ``geometric-photometric`` jitter already in the trainer:

1. **The photometric chain is a sensor model, not a gain and a bias.** A smooth illumination
   field, a randomly chosen blur kernel, gamma, resolution loss, Poisson shot noise, Gaussian
   read noise, intensity quantization, and contrast inversion, composed in physical order.
2. **Scale is randomized with exactly rebuilt targets.** Rescaling the frame changes the
   distance and center channels in ways a resampled target stack does not reproduce, so the
   target stack is rebuilt from the rescaled *label map*. That costs 216 ms per sample measured
   on this machine, which is far too slow per batch, so the rescaled variants are precomputed
   once into a hashed bank and indexed at batch time.

The bank is deterministic: it is a pure function of the label array, the scale ladder and the
target flavour, and the key recorded in it is the sha256 of exactly those inputs.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

from .multitask_models import targets as build_targets

#: Scale ladder fixed in section 5 of the pre-registration. Index 0 is the identity and is never
#: stored in the bank: it is the exact float32 target stack the trainer already builds.
#: Entries above 1.0 magnify (random-offset crop then resample). Entries below 1.0 shrink by
#: self-tiling, so the frame stays full of real content and nothing is zero-padded.
SCALE_LADDER: tuple[float, ...] = (1.0, 1.3, 1.7, 0.5)

#: Seed for the deterministic crop offsets of the magnifying variants. Fixed, so the bank does
#: not depend on the training seed and can be shared across every arm of the study.
BANK_SEED = 20260801


def _resize_image(image: np.ndarray, size: int) -> np.ndarray:
    """Bilinear resample of a uint8 frame, anti-aliased when shrinking."""
    from skimage.transform import resize

    resampled = resize(
        image.astype(np.float32) / 255.0,
        (size, size),
        order=1,
        preserve_range=True,
        anti_aliasing=size < image.shape[0],
    )
    return np.clip(np.round(resampled * 255.0), 0, 255).astype(np.uint8)


def _resize_labels(labels: np.ndarray, size: int) -> np.ndarray:
    """Nearest-neighbour resample of a label map. Never interpolate instance ids."""
    from skimage.transform import resize

    return resize(
        labels.astype(np.int32),
        (size, size),
        order=0,
        preserve_range=True,
        anti_aliasing=False,
    ).astype(np.int32)


def scale_sample(
    image: np.ndarray,
    labels: np.ndarray,
    scale: float,
    *,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray]:
    """Return ``(image, labels)`` rescaled by ``scale`` on a canvas of the original size.

    ``scale > 1`` magnifies: a ``size / scale`` window is cropped at a random offset and
    resampled up. ``scale < 1`` shrinks: the frame is resampled down to ``size * scale`` and
    self-tiled to fill the canvas, with a distinct instance-id block per tile so the seams read
    as genuine instance boundaries rather than as merged objects.
    """
    size = int(image.shape[0])
    if image.shape != labels.shape:
        raise ValueError("image and labels must share a shape")
    if scale == 1.0:
        return image.copy(), labels.astype(np.int32)
    if scale > 1.0:
        window = int(round(size / scale))
        if window < 16:
            raise ValueError(f"scale {scale} leaves a {window} px window, which is degenerate")
        top = int(rng.integers(0, size - window + 1))
        left = int(rng.integers(0, size - window + 1))
        cropped_image = image[top:top + window, left:left + window]
        cropped_labels = labels[top:top + window, left:left + window]
        return _resize_image(cropped_image, size), _resize_labels(cropped_labels, size)

    tiles = int(round(1.0 / scale))
    if tiles < 2 or size % tiles != 0 or abs(1.0 / scale - tiles) > 1e-9:
        # Silently rounding 0.3 to 1/3 would mean the recorded ladder is not the ladder that
        # ran. Refusing is the only honest option.
        raise ValueError(
            f"shrink scale {scale} must be exactly 1/k for integer k dividing the frame "
            f"size {size}"
        )
    tile_size = size // tiles
    small_image = _resize_image(image, tile_size)
    small_labels = _resize_labels(labels, tile_size)
    block = int(small_labels.max()) + 1
    out_image = np.empty((size, size), dtype=np.uint8)
    out_labels = np.zeros((size, size), dtype=np.int32)
    for row in range(tiles):
        for column in range(tiles):
            y = row * tile_size
            x = column * tile_size
            out_image[y:y + tile_size, x:x + tile_size] = small_image
            offset = (row * tiles + column) * block
            shifted = np.where(small_labels > 0, small_labels + offset, 0)
            out_labels[y:y + tile_size, x:x + tile_size] = shifted
    return out_image, out_labels


def bank_key(
    labels: np.ndarray,
    *,
    include_centers: bool,
    ladder: tuple[float, ...] = SCALE_LADDER,
) -> str:
    """sha256 over exactly the inputs the bank is a function of."""
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(labels.astype(np.uint16)).tobytes())
    digest.update(repr(tuple(float(value) for value in ladder)).encode("utf-8"))
    digest.update(f"centers={bool(include_centers)}|seed={BANK_SEED}".encode())
    return digest.hexdigest()


def build_bank(
    images: np.ndarray,
    labels: np.ndarray,
    *,
    include_centers: bool,
    ladder: tuple[float, ...] = SCALE_LADDER,
    progress: bool = False,
) -> dict[str, np.ndarray | str]:
    """Precompute the non-identity scale variants and their exactly rebuilt target stacks.

    Returned arrays are indexed ``[variant - 1, sample]``: variant 0 is the identity and stays
    with the trainer's own float32 targets, so the identity path is bit-identical to the
    no-augmentation arm's target construction.
    """
    variants = tuple(ladder[1:])
    count = len(images)
    channels = 4 if include_centers else 3
    size = int(images.shape[1])
    variant_images = np.empty((len(variants), count, size, size), dtype=np.uint8)
    variant_targets = np.empty(
        (len(variants), count, channels, size, size), dtype=np.float32
    )
    for variant_index, scale in enumerate(variants):
        for sample_index in range(count):
            rng = np.random.default_rng(
                (BANK_SEED, variant_index + 1, sample_index)
            )
            scaled_image, scaled_labels = scale_sample(
                images[sample_index], labels[sample_index].astype(np.int32), scale, rng=rng,
            )
            variant_images[variant_index, sample_index] = scaled_image
            variant_targets[variant_index, sample_index] = build_targets(
                scaled_labels, include_centers=include_centers,
            )
            if progress and (sample_index + 1) % 32 == 0:
                print(
                    f"bank scale={scale} {sample_index + 1}/{count}", flush=True,
                )
    return {
        "key": bank_key(labels, include_centers=include_centers, ladder=ladder),
        "ladder": np.asarray(ladder, dtype=np.float64),
        "images": variant_images,
        "targets": variant_targets,
    }


def load_or_build_bank(
    images: np.ndarray,
    labels: np.ndarray,
    *,
    include_centers: bool,
    path: Path | None,
    ladder: tuple[float, ...] = SCALE_LADDER,
    progress: bool = False,
) -> dict:
    """Return the variant bank, reusing ``path`` when its recorded key matches the inputs."""
    expected = bank_key(labels, include_centers=include_centers, ladder=ladder)
    if path is not None and path.is_file():
        archive = np.load(path)
        if str(archive["key"]) == expected:
            return {
                "key": expected,
                "ladder": archive["ladder"],
                "images": archive["images"],
                "targets": archive["targets"],
            }
        print(f"variant bank at {path} has a stale key; rebuilding", flush=True)
    bank = build_bank(
        images, labels, include_centers=include_centers, ladder=ladder, progress=progress,
    )
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez(
            path,
            key=np.asarray(bank["key"]),
            ladder=bank["ladder"],
            images=bank["images"],
            targets=bank["targets"],
        )
    return bank


def _smooth_field(
    shape: tuple[int, int], *, low: float, high: float, rng: np.random.Generator
) -> np.ndarray:
    """A smooth random field on ``shape``, from a coarse grid upsampled bilinearly."""
    grid = int(rng.integers(3, 9))
    coarse = rng.uniform(low, high, size=(grid, grid)).astype(np.float32)
    zoom = (shape[0] / grid, shape[1] / grid)
    field = ndi.zoom(coarse, zoom, order=1, mode="nearest")
    return field[: shape[0], : shape[1]]


def _blur(image: np.ndarray, *, rng: np.random.Generator) -> np.ndarray:
    """Apply one randomly chosen blur kernel, including a no-blur outcome."""
    kind = rng.choice(("none", "isotropic", "anisotropic", "motion"), p=(0.3, 0.3, 0.2, 0.2))
    if kind == "none":
        return image
    if kind == "isotropic":
        return ndi.gaussian_filter(image, sigma=float(rng.uniform(0.4, 2.2)))
    if kind == "anisotropic":
        return ndi.gaussian_filter(
            image, sigma=(float(rng.uniform(0.3, 2.4)), float(rng.uniform(0.3, 2.4))),
        )
    length = int(rng.integers(3, 10))
    angle = float(rng.uniform(0.0, np.pi))
    kernel = np.zeros((length, length), dtype=np.float32)
    center = (length - 1) / 2.0
    for step in np.linspace(-center, center, length * 4):
        y = int(round(center + step * np.sin(angle)))
        x = int(round(center + step * np.cos(angle)))
        if 0 <= y < length and 0 <= x < length:
            kernel[y, x] += 1.0
    kernel /= kernel.sum()
    return ndi.convolve(image, kernel, mode="reflect")


def randomize_appearance(image: np.ndarray, *, rng: np.random.Generator) -> np.ndarray:
    """Apply the pre-registered photometric and sensor chain to one float frame in [0, 1].

    Composed in physical order: scene illumination, optics, tone response, resolution, photon
    arrival, read-out, quantization, then display polarity.
    """
    out = np.clip(image.astype(np.float32), 0.0, 1.0)

    strength = float(rng.uniform(0.0, 0.45))
    if strength > 0.0:
        out = out * _smooth_field(
            out.shape, low=1.0 - strength, high=1.0 + strength, rng=rng,
        )
    additive = float(rng.uniform(0.0, 0.25))
    if additive > 0.0:
        out = out + additive * _smooth_field(out.shape, low=-1.0, high=1.0, rng=rng)
    out = np.clip(out, 0.0, 1.0)

    out = np.clip(_blur(out, rng=rng), 0.0, 1.0)

    gamma = float(np.exp(rng.uniform(np.log(0.5), np.log(2.0))))
    out = np.clip(out, 0.0, 1.0) ** gamma

    if rng.random() < 0.35:
        factor = float(rng.uniform(1.5, 3.5))
        small = max(8, int(round(out.shape[0] / factor)))
        out = ndi.zoom(
            ndi.zoom(out, small / out.shape[0], order=1),
            out.shape[0] / small,
            order=1,
        )
        out = np.clip(out, 0.0, 1.0)
        if out.shape != image.shape:
            padded = np.zeros(image.shape, dtype=np.float32)
            rows = min(out.shape[0], image.shape[0])
            columns = min(out.shape[1], image.shape[1])
            padded[:rows, :columns] = out[:rows, :columns]
            out = padded

    photons = float(10.0 ** rng.uniform(1.3, 3.0))
    out = rng.poisson(np.clip(out, 0.0, 1.0) * photons).astype(np.float32) / photons

    read_noise = float(rng.uniform(0.0, 0.06))
    if read_noise > 0.0:
        out = out + rng.normal(0.0, read_noise, size=out.shape).astype(np.float32)
    out = np.clip(out, 0.0, 1.0)

    levels = int(rng.choice((256, 256, 128, 64, 32, 16)))
    out = np.round(out * (levels - 1)) / (levels - 1)

    gain = float(rng.uniform(0.7, 1.3))
    bias = float(rng.uniform(-0.15, 0.15))
    out = np.clip(out * gain + bias, 0.0, 1.0)

    if rng.random() < 0.5:
        out = 1.0 - out

    return np.clip(out, 0.0, 1.0).astype(np.float32)


def augment_batch(images, truth, *, bank: dict, indices, rng: np.random.Generator):
    """Domain-randomize one batch.

    ``images`` and ``truth`` are the identity-variant tensors for ``indices``; a non-zero scale
    draw replaces both from the precomputed bank, so the target stack always matches the frame
    it was built from. D4 geometry is applied to image and targets together, and the appearance
    chain touches the image only.
    """
    import torch

    variant_images = bank["images"]
    variant_targets = bank["targets"]
    variants = 1 + len(variant_images)
    out_images = []
    out_truth = []
    for position, dataset_index in enumerate(indices):
        variant = int(rng.integers(0, variants))
        if variant == 0:
            image = images[position].clone()
            target = truth[position].clone()
        else:
            frame = variant_images[variant - 1, dataset_index].astype(np.float32) / 255.0
            image = torch.from_numpy(frame)[None]
            target = torch.from_numpy(
                np.ascontiguousarray(variant_targets[variant - 1, dataset_index])
            )
        turns = int(rng.integers(0, 4))
        image = torch.rot90(image, turns, dims=(1, 2))
        target = torch.rot90(target, turns, dims=(1, 2))
        if bool(rng.integers(0, 2)):
            image = torch.flip(image, dims=(2,))
            target = torch.flip(target, dims=(2,))
        if bool(rng.integers(0, 2)):
            image = torch.flip(image, dims=(1,))
            target = torch.flip(target, dims=(1,))
        randomized = randomize_appearance(image[0].numpy(), rng=rng)
        out_images.append(torch.from_numpy(randomized)[None])
        out_truth.append(target.contiguous())
    return torch.stack(out_images), torch.stack(out_truth)
