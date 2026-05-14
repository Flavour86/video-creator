from server.adapters import AIProvider as exported_provider
from server.adapters.ai import AIProvider as ai_package_provider
from server.adapters.ai.base import AIProvider as base_provider


def test_ai_provider_import_path_is_stable() -> None:
    assert base_provider is ai_package_provider
    assert ai_package_provider is exported_provider
