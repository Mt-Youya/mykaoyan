use serde_json::{Value, json};
use std::{path::Path, process::Command, thread, time::Duration};
use tiny_http::{Header, Request, Response, Server};

const TOKEN: &str = "fictional-publish-credential";
const PLAN_ID: &str = "D0000000-0000-4000-8000-000000000001";

fn chapter() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("数学二/01-虚构章");
    for kind in ["视频", "字幕", "讲稿"] {
        std::fs::create_dir_all(root.join(kind)).unwrap();
    }
    std::fs::write(root.join("视频/01-虚构讲.mp4"), "fictional-video").unwrap();
    std::fs::write(root.join("字幕/01-虚构讲.srt"), "fictional-subtitle").unwrap();
    std::fs::write(root.join("讲稿/01-虚构讲.md"), "虚构讲稿").unwrap();
    directory
}

fn run(directory: &Path, origin: &str) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "--origin", origin, "publish"])
        .arg(directory.join("数学二/01-虚构章"))
        .env("MYKAOYAN_TOKEN", TOKEN)
        .env_remove("MYKAOYAN_ORIGIN")
        .current_dir(directory)
        .output()
        .unwrap()
}

fn receive(server: &Server, method: &str, route: &str, auth: bool) -> Request {
    let request = server
        .recv_timeout(Duration::from_secs(10))
        .unwrap()
        .expect("CLI 缺少预期请求");
    assert_eq!(request.method().as_str(), method);
    assert_eq!(request.url(), route);
    let header = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"));
    if auth {
        assert_eq!(header.unwrap().value.as_str(), format!("Bearer {TOKEN}"));
    } else {
        assert!(header.is_none(), "对象上传不能携带站点令牌");
    }
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

fn result(slug: &str, hash: &str, cleanup: bool) -> Value {
    json!({"slug":slug,"contentHash":hash,"version":2,"listed":true,"keys":["fictional/video","fictional/subtitle"],"cleanupPending":cleanup})
}

fn assert_error(output: &std::process::Output) -> String {
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    let error: Value = serde_json::from_slice(&output.stderr).unwrap();
    let message = error["error"].as_str().unwrap();
    assert!(!message.contains(TOKEN));
    assert!(!message.contains("fictional-signature"));
    message.to_owned()
}

#[test]
fn publishes_uploads_completes_and_reads_back_without_leaking_auth_or_changing_output() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let base = origin.clone();
    let worker = thread::spawn(move || {
        let mut prepare = receive(&server, "POST", "/api/v1/publish/prepare", true);
        let input: Value = serde_json::from_reader(prepare.as_reader()).unwrap();
        assert!(input.get("listed").is_none());
        assert_eq!(input["scriptMarkdown"], "虚构讲稿");
        let uploads: Vec<_> = ["video", "subtitle"].map(|kind| {
            json!({"kind":kind,"url":format!("{base}/objects/{kind}?fictional-signature"),"headers":{"Content-MD5":input[kind]["md5"],"Content-Type":format!("fictional/{kind}"),"If-None-Match":"*"}})
        }).into();
        respond(
            prepare,
            &json!({"id":PLAN_ID,"unchanged":false,"contentHash":"fictional-hash","uploads":uploads}),
            201,
        );
        for (kind, bytes) in [
            ("video", "fictional-video"),
            ("subtitle", "fictional-subtitle"),
        ] {
            let mut upload = receive(
                &server,
                "PUT",
                &format!("/objects/{kind}?fictional-signature"),
                false,
            );
            for (name, expected) in [
                ("Content-MD5", input[kind]["md5"].as_str().unwrap()),
                ("If-None-Match", "*"),
            ] {
                assert_eq!(
                    upload
                        .headers()
                        .iter()
                        .find(|h| h.field.equiv(name))
                        .unwrap()
                        .value
                        .as_str(),
                    expected
                );
            }
            let mut transferred = String::new();
            upload.as_reader().read_to_string(&mut transferred).unwrap();
            assert_eq!(transferred, bytes);
            respond(upload, &json!({}), 200);
        }
        let completed = receive(
            &server,
            "POST",
            &format!("/api/v1/publish/{PLAN_ID}/complete"),
            true,
        );
        let slug = input["slug"].as_str().unwrap();
        respond(completed, &result(slug, "fictional-hash", true), 201);
        let readback = receive(
            &server,
            "GET",
            &format!("/api/v1/publish/lessons/{slug}"),
            true,
        );
        respond(readback, &result(slug, "fictional-hash", false), 200);
        slug.to_owned()
    });
    let directory = chapter();
    let output = run(directory.path(), &origin);
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let slug = worker.join().unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        json!({"published":[{"slug":slug,"unchanged":false,"cleanupPending":true,"publicationId":PLAN_ID,"version":2,"listed":true,"keys":["fictional/video","fictional/subtitle"]}],"skipped":[]})
    );
}

#[test]
fn unchanged_plan_skips_upload_and_complete_but_reports_readback_cleanup() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let worker = thread::spawn(move || {
        let mut prepare = receive(&server, "POST", "/api/v1/publish/prepare", true);
        let input: Value = serde_json::from_reader(prepare.as_reader()).unwrap();
        respond(
            prepare,
            &json!({"id":null,"unchanged":true,"contentHash":"fictional-hash","uploads":[]}),
            201,
        );
        let slug = input["slug"].as_str().unwrap();
        let readback = receive(
            &server,
            "GET",
            &format!("/api/v1/publish/lessons/{slug}"),
            true,
        );
        respond(readback, &result(slug, "fictional-hash", true), 200);
    });
    let directory = chapter();
    let output = run(directory.path(), &origin);
    worker.join().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["published"][0]["unchanged"], true);
    assert_eq!(value["published"][0]["cleanupPending"], true);
    assert_eq!(value["published"][0]["publicationId"], Value::Null);
    assert_eq!(value["published"][0]["listed"], true);
}

#[test]
fn refuses_publish_auth_conflict_redirect_and_invalid_plan_without_retry() {
    for status in [401, 403, 409, 302, 201] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let worker = thread::spawn(move || {
            let request = receive(&server, "POST", "/api/v1/publish/prepare", true);
            request
                .respond(
                    Response::from_string(json!({"fictional-signature":"do-not-echo"}).to_string())
                        .with_status_code(status)
                        .with_header(
                            Header::from_bytes("Content-Type", "application/json").unwrap(),
                        )
                        .with_header(Header::from_bytes("Location", "/forbidden").unwrap()),
                )
                .unwrap();
            assert!(
                server
                    .recv_timeout(Duration::from_millis(100))
                    .unwrap()
                    .is_none()
            );
        });
        let directory = chapter();
        let output = run(directory.path(), &origin);
        assert_error(&output);
        worker.join().unwrap();
    }
}

#[test]
fn failed_or_redirected_upload_never_completes_or_retries() {
    for status in [400, 302] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let base = origin.clone();
        let worker = thread::spawn(move || {
            let prepare = receive(&server, "POST", "/api/v1/publish/prepare", true);
            respond(
                prepare,
                &json!({"id":PLAN_ID,"unchanged":false,"contentHash":"fictional-hash","uploads":[{"kind":"video","url":format!("{base}/objects/video?fictional-signature"),"headers":{}}]}),
                201,
            );
            let request = receive(&server, "PUT", "/objects/video?fictional-signature", false);
            request
                .respond(
                    Response::from_string("")
                        .with_status_code(status)
                        .with_header(Header::from_bytes("Location", "/forbidden").unwrap()),
                )
                .unwrap();
            assert!(
                server
                    .recv_timeout(Duration::from_millis(100))
                    .unwrap()
                    .is_none()
            );
        });
        let directory = chapter();
        let output = run(directory.path(), &origin);
        assert!(assert_error(&output).contains("未登记讲"));
        assert!(
            directory
                .path()
                .join("数学二/01-虚构章/视频/01-虚构讲.mp4")
                .exists()
        );
        worker.join().unwrap();
    }
}

#[test]
fn readback_hash_mismatch_is_not_reported_as_success() {
    let server = Server::http("127.0.0.1:0").unwrap();
    let origin = format!("http://{}", server.server_addr());
    let worker = thread::spawn(move || {
        let mut prepare = receive(&server, "POST", "/api/v1/publish/prepare", true);
        let input: Value = serde_json::from_reader(prepare.as_reader()).unwrap();
        respond(
            prepare,
            &json!({"id":null,"unchanged":true,"contentHash":"fictional-hash","uploads":[]}),
            201,
        );
        let slug = input["slug"].as_str().unwrap();
        let readback = receive(
            &server,
            "GET",
            &format!("/api/v1/publish/lessons/{slug}"),
            true,
        );
        respond(readback, &result(slug, "different-hash", false), 200);
    });
    let directory = chapter();
    assert!(assert_error(&run(directory.path(), &origin)).contains("哈希不一致"));
    worker.join().unwrap();
}

#[test]
fn malformed_publish_json_and_complete_conflict_stop_without_retry() {
    for phase in ["prepare", "complete", "conflict", "readback"] {
        let server = Server::http("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", server.server_addr());
        let worker = thread::spawn(move || {
            let mut prepare = receive(&server, "POST", "/api/v1/publish/prepare", true);
            let input: Value = serde_json::from_reader(prepare.as_reader()).unwrap();
            let next = if phase == "prepare" {
                prepare
            } else {
                respond(
                    prepare,
                    &json!({"id":PLAN_ID,"unchanged":phase=="readback","contentHash":"fictional-hash","uploads":[]}),
                    201,
                );
                if phase == "readback" {
                    receive(
                        &server,
                        "GET",
                        &format!(
                            "/api/v1/publish/lessons/{}",
                            input["slug"].as_str().unwrap()
                        ),
                        true,
                    )
                } else {
                    receive(
                        &server,
                        "POST",
                        &format!("/api/v1/publish/{PLAN_ID}/complete"),
                        true,
                    )
                }
            };
            next.respond(
                Response::from_string("{fictional-signature")
                    .with_status_code(if phase == "conflict" { 409 } else { 201 })
                    .with_header(Header::from_bytes("Content-Type", "application/json").unwrap()),
            )
            .unwrap();
            assert!(
                server
                    .recv_timeout(Duration::from_millis(50))
                    .unwrap()
                    .is_none()
            );
        });
        let directory = chapter();
        assert_error(&run(directory.path(), &origin));
        worker.join().unwrap();
    }
}
