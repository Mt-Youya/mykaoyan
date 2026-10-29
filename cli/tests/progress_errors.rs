use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{path::Path, process::Command, thread, time::Duration};
use tiny_http::{Header, Response, Server};

const TOKEN: &str = "fictional-test-credential";

fn state_path(file: &Path) -> std::path::PathBuf {
    let mut path = file.as_os_str().to_owned();
    path.push(".etag.json");
    path.into()
}

fn candidate(file: &Path, origin: &str) {
    std::fs::write(
        file,
        include_str!("../../skills/mykaoyan/templates/progress.v1.json"),
    )
    .unwrap();
    std::fs::write(state_path(file), json!({"origin":origin,"credential_hash":format!("{:x}",Sha256::digest(TOKEN.as_bytes())),"etag":"\"revision-0\""}).to_string()).unwrap();
}

fn run(file: &Path, origin: &str) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "--origin", origin, "progress", "push"])
        .arg(file)
        .env("MYKAOYAN_TOKEN", TOKEN)
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(file.parent().unwrap())
        .output()
        .unwrap()
}

fn response(value: &Value, etag: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(value.to_string())
        .with_status_code(200)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap())
        .with_header(Header::from_bytes("ETag", etag).unwrap())
}

fn assert_failed_without_changes(
    file: &Path,
    before: &(Vec<u8>, Vec<u8>),
    output: &std::process::Output,
) -> String {
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert_eq!(std::fs::read(file).unwrap(), before.0);
    assert_eq!(std::fs::read(state_path(file)).unwrap(), before.1);
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    let message = error["error"].as_str().unwrap();
    assert!(!message.contains(TOKEN));
    message.to_owned()
}

#[test]
fn sidecar_errors_fail_before_any_request_and_preserve_candidate() {
    for problem in ["missing", "json", "origin", "token", "empty", "wildcard"] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("progress.json");
        candidate(&file, &origin);
        let mut state: Value =
            serde_json::from_slice(&std::fs::read(state_path(&file)).unwrap()).unwrap();
        match problem {
            "origin" => state["origin"] = json!("https://example.invalid"),
            "token" => state["credential_hash"] = json!("wrong-credential"),
            "empty" => state["etag"] = json!(""),
            "wildcard" => state["etag"] = json!("*"),
            _ => (),
        }
        std::fs::write(state_path(&file), state.to_string()).unwrap();
        if problem == "missing" {
            std::fs::remove_file(state_path(&file)).unwrap();
        }
        if problem == "json" {
            std::fs::write(state_path(&file), "private-marker{").unwrap();
        }
        let before = std::fs::read(&file).unwrap();
        let output = run(&file, &origin);
        assert_eq!(output.status.code(), Some(1), "{problem}");
        assert!(output.stdout.is_empty());
        assert_eq!(std::fs::read(&file).unwrap(), before);
        assert!(
            server
                .recv_timeout(Duration::from_millis(50))
                .unwrap()
                .is_none()
        );
        let error = String::from_utf8_lossy(&output.stderr);
        assert!(!error.contains(TOKEN));
        assert!(!error.contains("private-marker"));
    }
}

#[test]
fn server_auth_conflict_and_missing_if_match_preserve_candidate_and_sidecar() {
    for status in [401, 412, 428] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let worker = thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(10))
                .unwrap()
                .unwrap();
            assert_eq!(request.method().as_str(), "PUT");
            request
                .respond(Response::from_string("private-marker").with_status_code(status))
                .unwrap();
            assert!(
                server
                    .recv_timeout(Duration::from_millis(50))
                    .unwrap()
                    .is_none()
            );
        });
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("progress.json");
        candidate(&file, &origin);
        let before = (
            std::fs::read(&file).unwrap(),
            std::fs::read(state_path(&file)).unwrap(),
        );
        let message = assert_failed_without_changes(&file, &before, &run(&file, &origin));
        assert!(message.contains(&status.to_string()));
        assert!(!message.contains("private-marker"));
        worker.join().unwrap();
    }
}

#[test]
fn invalid_push_summary_or_readback_never_updates_document_or_sidecar() {
    for problem in ["summary", "data", "etag"] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let worker = thread::spawn(move || {
            let mut request = server
                .recv_timeout(Duration::from_secs(10))
                .unwrap()
                .unwrap();
            assert_eq!(request.method().as_str(), "PUT");
            assert_eq!(request.url(), "/api/v1/progress");
            assert_eq!(
                request
                    .headers()
                    .iter()
                    .find(|h| h.field.equiv("If-Match"))
                    .unwrap()
                    .value
                    .as_str(),
                "\"revision-0\""
            );
            let mut document: Value = serde_json::from_reader(request.as_reader()).unwrap();
            if problem == "summary" {
                request
                    .respond(response(&json!({}), "\"revision-1\""))
                    .unwrap();
            } else {
                let counts = json!({"profile":0,"progress":0,"mistakes":0,"daily":0,"dayPlans":0,"weekly":0});
                let summary = json!({"app":"mykaoyan","version":1,"etag":"\"revision-1\"","changes":{"added":counts,"updated":counts,"removed":counts}});
                request
                    .respond(response(&summary, "\"revision-1\""))
                    .unwrap();
                document["revision"] = json!(1);
                if problem == "data" {
                    document["data"]["daily"] = json!([{"date":"2030-01-01","minutes":{},"done":"different","tomorrowTop":"","retro":""}]);
                }
                let get = server
                    .recv_timeout(Duration::from_secs(10))
                    .unwrap()
                    .unwrap();
                assert_eq!(get.method().as_str(), "GET");
                get.respond(response(
                    &document,
                    if problem == "etag" {
                        "\"revision-2\""
                    } else {
                        "\"revision-1\""
                    },
                ))
                .unwrap();
            }
            assert!(
                server
                    .recv_timeout(Duration::from_millis(50))
                    .unwrap()
                    .is_none()
            );
        });
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("progress.json");
        candidate(&file, &origin);
        let before = (
            std::fs::read(&file).unwrap(),
            std::fs::read(state_path(&file)).unwrap(),
        );
        let output = run(&file, &origin);
        let message = assert_failed_without_changes(&file, &before, &output);
        assert!(message.contains(if problem == "summary" {
            "摘要"
        } else {
            "读回不一致"
        }));
        worker.join().unwrap();
    }
}
