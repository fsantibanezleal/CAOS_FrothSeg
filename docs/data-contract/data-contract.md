# Data contract

FrothSeg uses one record contract for synthetic, public, and private inputs. A
record identifies the source, frame, grouping unit, image URI, annotation URI,
license, scoreability, and optional physical scale. Source and grouping fields
are mandatory because image-level random splits leak adjacent frames and
appearance variants.

See [record and split rules](01_records-and-splits.md).
