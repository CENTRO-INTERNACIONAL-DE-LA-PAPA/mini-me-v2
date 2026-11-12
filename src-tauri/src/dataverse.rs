//! CIP's Dataverse, over its public HTTP API: searching datasets, listing a dataset's files and
//! downloading a file. The core makes every request, so a saved token never leaves it.

use std::io::Write;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::secrets::{KeychainSecrets, SecretSource};

const BASE_URL: &str = "https://data.cipotato.org";
/// The key account of the user's CIP Dataverse API token.
pub const ACCOUNT: &str = "dataverse";
/// Datasets in one page of results.
pub const PAGE_SIZE: u32 = 5;
const TIMEOUT: Duration = Duration::from_secs(30);

/// What to search for: keywords, and optionally the years a dataset was published in.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Search {
    pub query: String,
    pub from_year: Option<i32>,
    pub to_year: Option<i32>,
    /// How many matching datasets come before this page.
    #[serde(default)]
    pub start: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SearchPage {
    /// How many datasets match, on every page.
    pub total: u64,
    pub datasets: Vec<Dataset>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dataset {
    /// The persistent ID, such as `doi:10.21223/R694DO`.
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub url: String,
    pub description: String,
    /// How many files the dataset has.
    pub files: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DataverseFile {
    pub id: u64,
    pub name: String,
    pub media_type: String,
    pub size_bytes: u64,
    pub restricted: bool,
}

/// The query parameters of a search request.
fn search_params(search: &Search) -> Vec<(&'static str, String)> {
    let mut params = vec![
        ("q", search.query.trim().to_string()),
        ("type", "dataset".to_string()),
        ("start", search.start.to_string()),
        ("per_page", PAGE_SIZE.to_string()),
    ];
    if search.from_year.is_some() || search.to_year.is_some() {
        let year = |y: Option<i32>| y.map_or("*".to_string(), |y| y.to_string());
        let (from, to) = (year(search.from_year), year(search.to_year));
        params.push(("fq", format!("publicationDate:[{from} TO {to}]")));
    }
    params
}

/// A page of results from a search response's body.
fn parse_search(body: &Value) -> AppResult<SearchPage> {
    let data = body.get("data").ok_or_else(|| unreadable("search results"))?;
    let text = |item: &Value, key: &str| {
        item.get(key).and_then(Value::as_str).unwrap_or("").to_string()
    };
    let datasets = data
        .get("items")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .map(|item| Dataset {
            id: text(item, "global_id"),
            title: text(item, "name"),
            authors: item
                .get("authors")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                .unwrap_or_default(),
            year: text(item, "published_at").get(..4).and_then(|y| y.parse().ok()),
            url: text(item, "url"),
            description: text(item, "description"),
            files: item.get("fileCount").and_then(Value::as_u64).unwrap_or(0),
        })
        .collect();
    let total = data.get("total_count").and_then(Value::as_u64).unwrap_or(0);
    Ok(SearchPage { total, datasets })
}

/// A dataset's files from a file-list response's body. A tabular file that Dataverse ingested
/// is named and sized as its original, which is what a download fetches.
fn parse_files(body: &Value) -> AppResult<Vec<DataverseFile>> {
    let entries =
        body.get("data").and_then(Value::as_array).ok_or_else(|| unreadable("file list"))?;
    let mut files = Vec::new();
    for entry in entries {
        let Some(file) = entry.get("dataFile") else { continue };
        let Some(id) = file.get("id").and_then(Value::as_u64) else { continue };
        let original = |key: &str| file.get(key).filter(|v| !v.is_null());
        let name = original("originalFileName")
            .or_else(|| file.get("filename"))
            .and_then(Value::as_str)
            .unwrap_or("file");
        let media_type = original("originalFileFormat")
            .or_else(|| file.get("contentType"))
            .and_then(Value::as_str)
            .unwrap_or("application/octet-stream");
        let size = original("originalFileSize").or_else(|| file.get("filesize"));
        files.push(DataverseFile {
            id,
            name: name.to_string(),
            media_type: media_type.to_string(),
            size_bytes: size.and_then(Value::as_u64).unwrap_or(0),
            restricted: entry.get("restricted").and_then(Value::as_bool).unwrap_or(false),
        });
    }
    Ok(files)
}

pub fn search(search: &Search) -> AppResult<SearchPage> {
    let params = search_params(search);
    let body = off_runtime(move || get_json("/api/search", &params))?;
    parse_search(&body)
}

/// The files of the latest version of the dataset `dataset_id`.
pub fn files(dataset_id: &str) -> AppResult<Vec<DataverseFile>> {
    let params = vec![("persistentId", dataset_id.to_string())];
    let path = "/api/datasets/:persistentId/versions/:latest/files";
    let body = off_runtime(move || get_json(path, &params))?;
    parse_files(&body)
}

/// Downloads the file `file_id`, in its original format, into `to`.
pub fn download(file_id: u64, to: &Path) -> AppResult<()> {
    let to = to.to_path_buf();
    off_runtime(move || {
        let path = format!("/api/access/datafile/{file_id}");
        let request = with_token(client()?.get(url(&path, &[("format", "original".to_string())])?));
        let mut response = request.send().map_err(network_error)?;
        check_status(response.status().as_u16())?;
        let mut file = std::fs::File::create(&to)?;
        response.copy_to(&mut file).map_err(network_error)?;
        file.flush()?;
        Ok(())
    })
}

fn get_json(path: &str, params: &[(&str, String)]) -> AppResult<Value> {
    let request = client()?.get(url(path, params)?).timeout(TIMEOUT);
    let response = with_token(request).send().map_err(network_error)?;
    check_status(response.status().as_u16())?;
    response.json::<Value>().map_err(|_| unreadable("response"))
}

fn url(path: &str, params: &[(&str, String)]) -> AppResult<reqwest::Url> {
    reqwest::Url::parse_with_params(&format!("{BASE_URL}{path}"), params).map_err(|_| unavailable())
}

/// A client with no overall timeout, since a download can take as long as its size needs.
fn client() -> AppResult<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .connect_timeout(TIMEOUT)
        .timeout(None)
        .build()
        .map_err(network_error)
}

fn with_token(request: reqwest::blocking::RequestBuilder) -> reqwest::blocking::RequestBuilder {
    match KeychainSecrets.get(ACCOUNT) {
        Some(token) => request.header("X-Dataverse-key", token.expose()),
        None => request,
    }
}

fn check_status(status: u16) -> AppResult<()> {
    match status {
        200..=299 => Ok(()),
        401 | 403 => Err(AppError::new(
            "dataverse_needs_access",
            "Needs access: add your CIP Dataverse token in Settings.",
        )),
        404 => Err(AppError::not_found("CIP Dataverse has no such dataset or file.")),
        _ => Err(unavailable()),
    }
}

fn unavailable() -> AppError {
    AppError::new("dataverse_unavailable", "CIP Dataverse could not be reached. Try again later.")
}

fn network_error(_: reqwest::Error) -> AppError {
    unavailable()
}

fn unreadable(what: &str) -> AppError {
    let message = format!("CIP Dataverse sent a {what} Mini-Me cannot read.");
    AppError::new("dataverse_unavailable", message)
}

/// Runs `work` on a plain thread and waits for it: `reqwest`'s blocking client must not run
/// inside the async runtime that Tauri commands use.
fn off_runtime<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    std::thread::spawn(work).join().unwrap_or_else(|_| Err(unavailable()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_search_asks_for_one_page_of_datasets_and_its_years() {
        let search = Search {
            query: " late blight ".into(),
            from_year: Some(2020),
            to_year: None,
            start: 20,
        };
        let params = search_params(&search);
        assert!(params.contains(&("q", "late blight".into())));
        assert!(params.contains(&("type", "dataset".into())));
        assert!(params.contains(&("start", "20".into())));
        assert!(params.contains(&("fq", "publicationDate:[2020 TO *]".into())));

        let no_years = Search { from_year: None, ..search };
        assert!(search_params(&no_years).iter().all(|(key, _)| *key != "fq"));
    }

    #[test]
    fn search_results_are_read_into_datasets() {
        let body = json!({ "status": "OK", "data": { "total_count": 213, "items": [{
            "global_id": "doi:10.21223/R694DO",
            "name": "Dataset for: Integrated management of late blight data",
            "authors": ["Atieno, Elly"],
            "published_at": "2020-09-08T14:53:36Z",
            "url": "https://doi.org/10.21223/R694DO",
            "description": "Field trials in Kenya.",
            "fileCount": 3
        }]}});
        let page = parse_search(&body).unwrap();
        assert_eq!(page.total, 213);
        let dataset = &page.datasets[0];
        assert_eq!(dataset.id, "doi:10.21223/R694DO");
        assert_eq!(dataset.authors, ["Atieno, Elly"]);
        assert_eq!((dataset.year, dataset.files), (Some(2020), 3));
        assert!(parse_search(&json!({ "status": "ERROR" })).is_err());
    }

    #[test]
    fn an_ingested_table_is_listed_as_its_original() {
        let body = json!({ "status": "OK", "data": [
            { "restricted": false, "dataFile": {
                "id": 4310, "filename": "dictionary.xlsx", "filesize": 11939,
                "contentType": "application/vnd.ms-excel",
                "originalFileName": null, "originalFileFormat": null, "originalFileSize": null } },
            { "restricted": true, "dataFile": {
                "id": 4311, "filename": "trial.tab", "filesize": 900,
                "contentType": "text/tab-separated-values",
                "originalFileName": "trial.csv", "originalFileFormat": "text/csv",
                "originalFileSize": 1200 } }
        ]});
        let files = parse_files(&body).unwrap();
        assert_eq!((files[0].name.as_str(), files[0].size_bytes), ("dictionary.xlsx", 11939));
        let trial = &files[1];
        assert_eq!((trial.name.as_str(), trial.media_type.as_str()), ("trial.csv", "text/csv"));
        assert_eq!((trial.size_bytes, trial.restricted), (1200, true));
    }

    #[test]
    #[ignore = "reaches CIP Dataverse over the network"]
    fn searching_listing_and_downloading_from_cip_dataverse() {
        let search =
            Search { query: "late blight".into(), from_year: Some(2020), to_year: None, start: 0 };
        let page = super::search(&search).unwrap();
        assert!(page.total > 0 && !page.datasets.is_empty());
        let dataset = page.datasets.iter().find(|d| d.files > 0).unwrap();
        let listed = files(&dataset.id).unwrap();
        let file = listed.iter().filter(|f| !f.restricted).min_by_key(|f| f.size_bytes).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let to = dir.path().join("file");
        download(file.id, &to).unwrap();
        assert!(std::fs::metadata(&to).unwrap().len() > 0);
    }

    #[test]
    fn a_refused_request_asks_for_access_and_others_say_dataverse_is_unavailable() {
        assert!(check_status(200).is_ok());
        assert_eq!(check_status(403).unwrap_err().code, "dataverse_needs_access");
        assert_eq!(check_status(503).unwrap_err().code, "dataverse_unavailable");
    }
}
