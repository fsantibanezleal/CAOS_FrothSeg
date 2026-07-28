"""The per-file inference lane: what it does, and what it refuses to pretend."""

from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from fslab.infer_file import (
    VideoNotSupported,
    collect_inputs,
    infer_path,
    load_grayscale,
)
from fslab.science.froth_gen import CASES, generate, generate_sequence


def _write_case(path, case_name="poly-normal"):
    scene = generate(next(case for case in CASES if case.name == case_name))
    array = np.rint(np.clip(scene["image"], 0.0, 1.0) * 255).astype(np.uint8)
    Image.fromarray(array).save(path)
    return scene


def test_video_containers_are_refused_with_the_reason(tmp_path):
    """A video must not fail with a generic decode error. The repository decodes no video,
    and the message has to say that and say what to do instead."""
    clip = tmp_path / "cell.mp4"
    clip.write_bytes(b"not really a video")
    with pytest.raises(VideoNotSupported, match="does not decode video"):
        load_grayscale(clip)
    with pytest.raises(VideoNotSupported, match="Extract frames first"):
        load_grayscale(tmp_path / "cell.avi")


def test_unsupported_extension_is_named(tmp_path):
    target = tmp_path / "notes.txt"
    target.write_text("x", encoding="utf-8")
    with pytest.raises(ValueError, match="unsupported image type"):
        load_grayscale(target)


def test_directory_input_is_ordered_and_image_only(tmp_path):
    for index in (2, 0, 1):
        _write_case(tmp_path / f"frame{index:03d}.png")
    (tmp_path / "readme.txt").write_text("ignored", encoding="utf-8")
    frames = collect_inputs(tmp_path)
    assert [path.name for path in frames] == ["frame000.png", "frame001.png", "frame002.png"]


def test_empty_directory_and_missing_path_fail_clearly(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    with pytest.raises(ValueError, match="no images found"):
        collect_inputs(empty)
    with pytest.raises(FileNotFoundError):
        collect_inputs(tmp_path / "nope.png")


def test_unknown_method_lists_the_registry(tmp_path):
    image = tmp_path / "froth.png"
    _write_case(image)
    with pytest.raises(ValueError, match="registered methods are"):
        infer_path(method_id="ZZ", target=image, output_root=tmp_path / "out")


def test_prompted_video_method_has_no_single_image_lane(tmp_path):
    """L7 is prompted with first-frame truth. Offering it here would imply an unprompted
    capability it does not have."""
    image = tmp_path / "froth.png"
    _write_case(image)
    with pytest.raises(ValueError, match="no unprompted single-image lane"):
        infer_path(method_id="L7", target=image, output_root=tmp_path / "out")


def test_classical_inference_reports_masks_but_never_a_score(tmp_path):
    image = tmp_path / "froth.png"
    _write_case(image)
    output = tmp_path / "out"
    report = infer_path(
        method_id="C4", target=image, output_root=output, device="cpu"
    )

    assert report["schema"] == "frothseg.file-inference/v1"
    assert report["method_id"] == "C4"
    assert report["frame_count"] == 1
    # The central honesty property: a user-supplied image has no ground truth, so no
    # accuracy may be reported for it. Checked against the DATA keys, not the prose, since
    # the scope note legitimately contains the word while denying the claim.
    assert report["scored"] is False
    forbidden = {"ap", "ap50", "mean_ap", "pq", "iou", "accuracy", "score"}
    assert not forbidden & set(report)
    for row in report["results"]:
        assert not forbidden & set(row)
        assert not forbidden & set(row["descriptors"])

    row = report["results"][0]
    assert row["descriptors"]["count"] > 0
    assert row["descriptors"]["unit"] == "px"
    assert (output / row["labels_path"]).is_file()
    assert (output / row["overlay_path"]).is_file()
    assert json.loads((output / "inference.json").read_text(encoding="utf-8")) == report


def test_scale_switches_descriptors_to_physical_units(tmp_path):
    image = tmp_path / "froth.png"
    _write_case(image)
    pixels = infer_path(
        method_id="C4", target=image, output_root=tmp_path / "px", device="cpu"
    )["results"][0]["descriptors"]
    millimetres = infer_path(
        method_id="C4",
        target=image,
        output_root=tmp_path / "mm",
        device="cpu",
        px_per_mm=10.0,
    )["results"][0]["descriptors"]

    assert pixels["unit"] == "px" and millimetres["unit"] == "mm"
    assert millimetres["d50"] == pytest.approx(pixels["d50"] / 10.0, rel=1e-6)


def test_association_is_opt_in_for_a_frame_directory(tmp_path):
    """A directory of unrelated photographs is not a sequence, so identities are only
    assigned when the caller says the frames belong together."""
    frames_dir = tmp_path / "frames"
    frames_dir.mkdir()
    spec = next(case for case in CASES if case.name == "motion-fast")
    for index, frame in enumerate(generate_sequence(spec, frames=3)):
        array = np.rint(np.clip(frame["image"], 0.0, 1.0) * 255).astype(np.uint8)
        Image.fromarray(array).save(frames_dir / f"frame{index:03d}.png")

    plain = infer_path(
        method_id="C4", target=frames_dir, output_root=tmp_path / "plain", device="cpu"
    )
    assert plain["identity_association"] == "none"
    assert plain["frame_count"] == 3

    tracked = infer_path(
        method_id="C4",
        target=frames_dir,
        output_root=tmp_path / "tracked",
        device="cpu",
        associate=True,
    )
    assert tracked["identity_association"].startswith("iou@")
