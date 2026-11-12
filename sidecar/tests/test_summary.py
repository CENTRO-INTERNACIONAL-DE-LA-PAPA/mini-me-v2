from mini_me_sidecar.summary import MAX_TITLE_CHARS, clean_title


def test_a_title_is_the_first_line_without_quotes_or_a_full_stop():
    assert clean_title('"Yield by altitude."\n\nBecause it matters') == "Yield by altitude"
    assert clean_title("  **Late blight trial**  ") == "Late blight trial"
    assert clean_title("   \n  ") == ""
    long = "Breaking the chicken-or-egg riddle into research questions on evolution, definitions"
    cut = clean_title(long)
    assert len(cut) <= MAX_TITLE_CHARS and long.startswith(cut)
    assert cut == "Breaking the chicken-or-egg riddle into research questions"
    assert long[len(cut)] == " "  # cut after a whole word
    assert clean_title("Short title") == "Short title"
    assert len(clean_title("x" * 100)) == MAX_TITLE_CHARS
