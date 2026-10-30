use serde_json::{Value, json};
use std::{path::Path, process::Command, thread, time::Duration};
use tiny_http::{Header, Request, Response, Server};

const TOKEN: &str = "fictional-publish-credential";
const HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

fn markdown_file() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(
        directory.path().join("handout.md"),
        "# 虚构题面\n\n只发布题面，不包含答案。",
    )
    .unwrap();
    directory
}

fn run(directory: &Path, origin: &str, extra: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "--origin", origin, "publish-handout"])
        .arg(directory.join("handout.md"))
        .args([
            "--subject",
            "408",
            "--slug",
            "fictional-handout",
            "--title",
            "虚构题面",
        ])
        .args(extra)
        .env("MYKAOYAN_TOKEN", TOKEN)
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(directory)
        .output()
        .unwrap()
}

fn result(unchanged: bool) -> Value {
    json!({
        "slug": "fictional-handout",
        "unchanged": unchanged,
        "listed": false,
        "contentHash": HASH,
        "updatedAt": "2026-10-30T12:00:00.000Z",
    })
}

fn receive(server: &Server) -> Request {
    let request = server
        .recv_timeout(Duration::from_secs(10))
        .unwrap()
        .expect("CLI 缺少预期请求");
    assert_eq!(request.method().as_str(), "PUT");
    assert_eq!(request.url(), "/api/v1/publish/handouts/fictional-handout");
    let header = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .expect("讲义发布必须携带令牌");
    assert_eq!(header.value.as_str(), format!("Bearer {TOKEN}"));
    request
}

fn respond(request: Request, value: &Value, status: u16) {
    request
        .respond(
            Response::from_string(value.to_string())
                .with_status_code(status)
                .with_header(Header::from_bytes("Content-Type", "application/json").unwrap()),
        )
        .unwrap();
}

#[test]
fn publishes_handout_with_single_request_and_prints_server_result() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let expected = result(false);
    let responder = expected.clone();
    let worker = thread::spawn(move || {
        let mut request = receive(&server);
        let input: Value = serde_json::from_reader(request.as_reader()).unwrap();
        assert_eq!(input["subjectCode"], "408");
        assert_eq!(input["slug"], "fictional-handout");
        assert_eq!(input["title"], "虚构题面");
        assert_eq!(input["position"], 1);
        assert_eq!(input["markdown"], "# 虚构题面\n\n只发布题面，不包含答案。");
        assert!(input.get("listed").is_none());
        respond(request, &responder, 200);
        assert!(
            server
                .recv_timeout(Duration::from_millis(50))
                .unwrap()
                .is_none(),
            "讲义发布必须只发一个请求"
        );
    });
    let directory = markdown_file();
    let output = run(directory.path(), &origin, &[]);
    worker.join().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let printed: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(printed, expected);
    assert!(!String::from_utf8_lossy(&output.stdout).contains(TOKEN));
}

#[test]
fn reports_unchanged_without_uploading_again() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let expected = result(true);
    let responder = expected.clone();
    let worker = thread::spawn(move || {
        respond(receive(&server), &responder, 200);
    });
    let directory = markdown_file();
    let output = run(directory.path(), &origin, &[]);
    worker.join().unwrap();
    assert!(output.status.success());
    let printed: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(printed, expected);
}

#[test]
fn maps_error_statuses_without_retrying() {
    for status in [400, 401, 403] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let worker = thread::spawn(move || {
            respond(receive(&server), &json!({"message": "fictional"}), status);
            assert!(
                server
                    .recv_timeout(Duration::from_millis(50))
                    .unwrap()
                    .is_none(),
                "错误后不能自动重试"
            );
        });
        let directory = markdown_file();
        let output = run(directory.path(), &origin, &[]);
        worker.join().unwrap();
        assert_eq!(output.status.code(), Some(1), "HTTP {status}");
        assert!(output.stdout.is_empty());
        let error: Value = serde_json::from_slice(&output.stderr).unwrap();
        let message = error["error"].as_str().unwrap();
        assert!(!message.contains(TOKEN));
        assert!(!message.is_empty());
    }
}

#[test]
fn dry_run_checks_contract_without_network_or_credentials() {
    let directory = markdown_file();
    let output = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "publish-handout"])
        .arg(directory.path().join("handout.md"))
        .args([
            "--subject",
            "408",
            "--slug",
            "fictional-handout",
            "--title",
            "虚构题面",
            "--dry-run",
        ])
        .env_remove("MYKAOYAN_TOKEN")
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(directory.path())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["dryRun"], true);
    assert_eq!(value["slug"], "fictional-handout");
    assert_eq!(
        value["bytes"].as_u64().unwrap(),
        "# 虚构题面\n\n只发布题面，不包含答案。".len() as u64
    );
    assert_eq!(value["contentHash"].as_str().unwrap().len(), 64);
}

#[test]
fn rejects_answer_files_before_reading_them() {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("答案解析.md");
    std::fs::write(&file, "do-not-read").unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args([
            "--json",
            "--origin",
            "http://127.0.0.1:1",
            "publish-handout",
        ])
        .arg(&file)
        .args([
            "--subject",
            "408",
            "--slug",
            "fictional-handout",
            "--title",
            "虚构题面",
        ])
        .env("MYKAOYAN_TOKEN", TOKEN)
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(directory.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    let message = error["error"].as_str().unwrap();
    assert!(message.contains("答案") || message.contains("解析"));
    assert!(!message.contains("do-not-read"));
}
