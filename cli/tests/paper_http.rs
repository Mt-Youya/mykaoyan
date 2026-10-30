use serde_json::{Value, json};
use std::{path::Path, process::Command, thread, time::Duration};
use tiny_http::{Header, Request, Response, Server};

const TOKEN: &str = "fictional-publish-credential";
const HASH: &str = "0000000000000000000000000000000000000000000000000000000000000000";

fn paper() -> Value {
    json!({
        "subjectCode": "408",
        "year": 2024,
        "slug": "fictional-paper",
        "title": "虚构试卷",
        "sourceNote": "虚构来源",
        "position": 1,
        "questions": [
            {
                "number": 1,
                "type": "单选",
                "score": 2,
                "topics": ["线性表"],
                "stemMarkdown": "虚构题面",
                "options": [{"label": "A", "markdown": "选项 A"}, {"label": "B", "markdown": "选项 B"}],
                "answerMarkdown": "答案 A",
                "analysisMarkdown": "虚构解析"
            },
            {
                "number": 2,
                "type": "简答",
                "score": 10,
                "topics": [],
                "stemMarkdown": "虚构简答",
                "options": null,
                "answerMarkdown": "答案简答",
                "analysisMarkdown": null
            }
        ]
    })
}

fn write_paper(value: &Value) -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(
        directory.path().join("paper.json"),
        serde_json::to_vec(value).unwrap(),
    )
    .unwrap();
    directory
}

fn run(directory: &Path, origin: &str, extra: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "--origin", origin, "publish-paper"])
        .arg(directory.join("paper.json"))
        .args(extra)
        .env("MYKAOYAN_TOKEN", TOKEN)
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(directory)
        .output()
        .unwrap()
}

fn result(unchanged: bool) -> Value {
    json!({
        "slug": "fictional-paper",
        "unchanged": unchanged,
        "version": 1,
        "listed": false,
        "contentHash": HASH,
        "questionCount": 2,
    })
}

fn receive(server: &Server) -> Request {
    let request = server
        .recv_timeout(Duration::from_secs(10))
        .unwrap()
        .expect("CLI 缺少预期请求");
    assert_eq!(request.method().as_str(), "PUT");
    assert_eq!(request.url(), "/api/v1/publish/papers/fictional-paper");
    let header = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .expect("试卷发布必须携带令牌");
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
fn publishes_paper_with_single_request_and_prints_server_result() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let expected = result(false);
    let responder = expected.clone();
    let worker = thread::spawn(move || {
        let mut request = receive(&server);
        let input: Value = serde_json::from_reader(request.as_reader()).unwrap();
        assert_eq!(input["subjectCode"], "408");
        assert_eq!(input["year"], 2024);
        assert_eq!(input["slug"], "fictional-paper");
        assert_eq!(input["questions"].as_array().unwrap().len(), 2);
        assert_eq!(input["questions"][0]["answerMarkdown"], "答案 A");
        assert!(input.get("listed").is_none());
        respond(request, &responder, 200);
        assert!(
            server
                .recv_timeout(Duration::from_millis(50))
                .unwrap()
                .is_none(),
            "试卷发布必须只发一个请求"
        );
    });
    let directory = write_paper(&paper());
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
    let directory = write_paper(&paper());
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
        let directory = write_paper(&paper());
        let output = run(directory.path(), &origin, &[]);
        worker.join().unwrap();
        assert_eq!(output.status.code(), Some(1), "HTTP {status}");
        assert!(output.stdout.is_empty());
        let error: Value = serde_json::from_slice(&output.stderr).unwrap();
        assert!(
            error["error"]
                .as_str()
                .is_some_and(|value| !value.is_empty())
        );
    }
}

#[test]
fn dry_run_checks_contract_without_network_or_credentials() {
    let directory = write_paper(&paper());
    let output = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "publish-paper"])
        .arg(directory.path().join("paper.json"))
        .arg("--dry-run")
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
    assert_eq!(value["slug"], "fictional-paper");
    assert_eq!(value["questions"], 2);
    assert!(value["bytes"].as_u64().unwrap() > 0);
    assert_eq!(value["contentHash"].as_str().unwrap().len(), 64);
}

#[test]
fn rejects_invalid_questions_before_network() {
    let mut unordered = paper();
    unordered["questions"][0]["number"] = json!(3);
    unordered["questions"][1]["number"] = json!(2);
    let directory = write_paper(&unordered);
    let output = run(directory.path(), "http://127.0.0.1:1", &[]);
    assert_eq!(output.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert!(error["error"].as_str().unwrap().contains("题号"));

    let mut missing_options = paper();
    missing_options["questions"][0]["options"] = Value::Null;
    let directory = write_paper(&missing_options);
    let output = run(directory.path(), "http://127.0.0.1:1", &[]);
    assert_eq!(output.status.code(), Some(1));
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    assert!(error["error"].as_str().unwrap().contains("选项"));
}
