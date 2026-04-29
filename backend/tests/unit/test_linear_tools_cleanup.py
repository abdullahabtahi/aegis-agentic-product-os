"""Tests: dead code removed from linear_tools (spec 005 1E)."""

from tools.linear_tools import MockLinearMCP


def test_mock_linear_has_no_fixture_method():
    """get_linear_signals_from_fixture must not exist on MockLinearMCP."""
    mcp = MockLinearMCP()
    assert not hasattr(mcp, "get_linear_signals_from_fixture")


def test_list_linear_issues_not_exported():
    """list_linear_issues FunctionTool wrapper must not be importable from linear_tools."""
    import tools.linear_tools as lt

    assert not hasattr(lt, "list_linear_issues")


def test_list_linear_relations_not_exported():
    """list_linear_relations FunctionTool wrapper must not be importable from linear_tools."""
    import tools.linear_tools as lt

    assert not hasattr(lt, "list_linear_relations")
