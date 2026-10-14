from mini_me_sidecar.traits.base import Trait, TraitInfo
from mini_me_sidecar.traits.echo import Echo

__all__ = ["Trait", "TraitInfo", "load_traits"]


def load_traits(test_traits: bool) -> dict[str, Trait]:
    traits: list[Trait] = [Echo()]
    if test_traits:
        from mini_me_sidecar.traits.testing import TEST_TRAITS

        traits.extend(TEST_TRAITS)
    by_id: dict[str, Trait] = {}
    for trait in traits:
        if trait.info.id in by_id:
            raise ValueError(f"two Traits share the ID {trait.info.id!r}")
        by_id[trait.info.id] = trait
    return by_id
