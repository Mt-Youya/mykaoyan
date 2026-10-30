use serde_json::{Value, json};
use std::{
    process::{Command, Output},
    thread,
    time::Duration,
};
use tiny_http::{Header, Response, Server};
fn command(home: &std::path::Path, origin: &str, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "--origin", origin])
        .args(args)
        .env("MYKAOYAN_TOKEN", "fictional-test-credential")
        .env("HOME", home)
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(home)
        .output()
        .unwrap()
}
fn response(value: &Value, status: u16, etag: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(value.to_string())
        .with_status_code(status)
        .with_header(Header::from_bytes("content-type", "application/json").unwrap())
        .with_header(Header::from_bytes("etag", etag).unwrap())
}
#[test]
fn replays_openapi_pull_push_readback_and_conflict() {
    let api: Value = serde_json::from_str(include_str!("../contracts/openapi.json")).unwrap();
    let route = "/api/v1/progress";
    assert!(api["paths"][route]["put"]["responses"]["412"].is_object());
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let worker = thread::spawn(move || {
        let mut document: Value = serde_json::from_str(include_str!(
            "../../skills/mykaoyan/templates/progress.v1.json"
        ))
        .unwrap();
        for step in 0..4 {
            let mut request = server
                .recv_timeout(Duration::from_secs(10))
                .unwrap()
                .expect("CLI 未发出预期请求");
            assert_eq!(request.url(), route);
            assert!(
                request
                    .headers()
                    .iter()
                    .any(|h| h.field.equiv("Authorization")
                        && h.value.as_str() == "Bearer fictional-test-credential")
            );
            match step {
                0 => {
                    assert_eq!(request.method().as_str(), "GET");
                    request
                        .respond(response(&document, 200, "\"revision-0\""))
                        .unwrap();
                }
                1 => {
                    assert_eq!(request.method().as_str(), "PUT");
                    assert!(
                        request
                            .headers()
                            .iter()
                            .any(|h| h.field.equiv("If-Match")
                                && h.value.as_str() == "\"revision-0\"")
                    );
                    document = serde_json::from_reader(request.as_reader()).unwrap();
                    assert_eq!(
                        document["data"]["daily"][0]["minutes"]["302"].as_f64(),
                        Some(45.0)
                    );
                    document["data"]["daily"][0]["minutes"]["302"] = json!(45);
                    document["revision"] = json!(1);
                    let counts = json!({"profile":0,"progress":0,"mistakes":0,"daily":0,"dayPlans":0,"weekly":0});
                    let mut added = counts.clone();
                    added["daily"] = json!(1);
                    request.respond(response(&json!({"app":"mykaoyan","version":1,"etag":"\"revision-1\"","changes":{"added":added,"updated":counts,"removed":counts}}),200,"\"revision-1\"")).unwrap();
                }
                2 => {
                    assert_eq!(request.method().as_str(), "GET");
                    request
                        .respond(response(&document, 200, "\"revision-1\""))
                        .unwrap();
                }
                _ => {
                    assert_eq!(request.method().as_str(), "PUT");
                    request
                        .respond(response(&json!({"status":412}), 412, "\"revision-2\""))
                        .unwrap();
                }
            }
        }
    });
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("progress.json");
    let args = ["progress", "pull", file.to_str().unwrap()];
    let pulled = command(dir.path(), &origin, &args);
    assert!(
        pulled.status.success(),
        "{}",
        String::from_utf8_lossy(&pulled.stderr)
    );
    let mut document: Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    document["data"]["daily"] = json!([{"date":"2030-03-10","minutes":{"302":45},"done":"虚构完成","tomorrowTop":"","retro":""}]);
    std::fs::write(&file, document.to_string().replace(":45", ":45e0")).unwrap();
    let pushed = command(
        dir.path(),
        &origin,
        &["progress", "push", file.to_str().unwrap()],
    );
    assert!(
        pushed.status.success(),
        "{}",
        String::from_utf8_lossy(&pushed.stderr)
    );
    let readback: Value = serde_json::from_slice(&std::fs::read(&file).unwrap()).unwrap();
    assert_eq!(readback["revision"], 1);
    assert_eq!(readback["data"], document["data"]);
    let before = std::fs::read(&file).unwrap();
    let conflict = command(
        dir.path(),
        &origin,
        &["progress", "push", file.to_str().unwrap()],
    );
    assert_eq!(conflict.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&conflict.stderr).unwrap();
    assert!(error["error"].as_str().unwrap().contains("先拉取"));
    assert_eq!(before, std::fs::read(&file).unwrap());
    worker.join().unwrap();
}
#[test]
fn refuses_auth_failure_redirect_and_missing_etag() {
    for status in [401, 302, 200] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let worker = thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(10))
                .unwrap()
                .unwrap();
            request
                .respond(
                    Response::from_string("{}")
                        .with_status_code(status)
                        .with_header(
                            Header::from_bytes("location", "https://example.invalid").unwrap(),
                        ),
                )
                .unwrap();
        });
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("progress.json");
        let result = command(
            dir.path(),
            &origin,
            &["progress", "pull", file.to_str().unwrap()],
        );
        assert_eq!(result.status.code(), Some(1));
        assert!(!file.exists());
        assert!(!String::from_utf8_lossy(&result.stderr).contains("fictional-test-credential"));
        worker.join().unwrap();
    }
}
