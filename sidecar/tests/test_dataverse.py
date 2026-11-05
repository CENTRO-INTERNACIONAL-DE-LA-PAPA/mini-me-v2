from mini_me_sidecar.adapters.dataverse import DataverseSearch, datasets_text, search_params


def test_the_models_search_becomes_the_first_page_of_a_dataverse_search():
    search = DataverseSearch(query=" late blight Peru ", from_year=2020)
    assert search_params(search) == {
        "query": "late blight Peru",
        "from_year": 2020,
        "to_year": None,
        "start": 0,
    }


def test_an_empty_query_searches_everything_and_reversed_years_are_swapped():
    params = search_params(DataverseSearch(query="  ", from_year=2024, to_year=2019))
    assert (params["query"], params["from_year"], params["to_year"]) == ("*", 2019, 2024)


def test_datasets_are_listed_as_text_when_the_card_is_refused():
    text = datasets_text([
        {"title": "Late blight trials", "year": 2021, "authors": ["Atieno, Elly"],
         "url": "https://doi.org/10.21223/R694DO"},
        {"title": "Weather", "year": None, "authors": [], "url": ""},
    ])
    assert text.splitlines() == [
        "1. **Late blight trials** (2021): Atieno, Elly, https://doi.org/10.21223/R694DO",
        "2. **Weather**",
    ]
