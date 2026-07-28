from fslab.model_registry import METHODS, registry_document, validate_registry


def test_full_method_ladder_is_explicit_and_valid():
    assert validate_registry() == []
    assert len(METHODS) == 15
    assert {method.id for method in METHODS} == {
        *(f"C{i}" for i in range(1, 8)),
        *(f"L{i}" for i in range(1, 8)),
        "N1",
    }
    assert {method.tier for method in METHODS} == {
        "classical", "domain-sota", "foundation", "frontier"
    }


def test_registry_accepts_only_the_completed_method_ladder():
    doc = registry_document()
    accepted = [method for method in doc["methods"] if method["state"] == "accepted"]
    assert len(accepted) == 15
