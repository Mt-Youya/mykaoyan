use serde_json::{Value, json};
use std::io::Write;
use std::process::{Command, Stdio};
fn cli(home: &std::path::Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(args)
        .env("HOME", home)
        .env("XDG_CONFIG_HOME", home)
        .env_remove("MYKAOYAN_TOKEN")
        .env_remove("MYKAOYAN_ORIGIN")
        .output()
        .unwrap()
}
#[test]
fn validates_offline_and_reports_private_errors_as_json() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("progress.json");
    std::fs::write(
        &file,
        include_str!("../../skills/mykaoyan/templates/progress.v1.json"),
    )
    .unwrap();
    let result = cli(
        dir.path(),
        &["--json", "progress", "validate", file.to_str().unwrap()],
    );
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&result.stdout).unwrap()["valid"],
        true
    );
    std::fs::write(&file, r#"{"secret-marker":"#).unwrap();
    let result = cli(
        dir.path(),
        &["--json", "progress", "validate", file.to_str().unwrap()],
    );
    assert_eq!(result.status.code(), Some(1));
    assert!(result.stdout.is_empty());
    assert!(serde_json::from_slice::<Value>(&result.stderr).unwrap()["error"].is_string());
    assert!(!String::from_utf8_lossy(&result.stderr).contains("secret-marker"));
}
#[test]
fn login_accepts_stdin_without_echoing_token() {
    let dir = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "login", "--token-stdin"])
        .env("HOME", dir.path())
        .env("XDG_CONFIG_HOME", dir.path())
        .env_remove("MYKAOYAN_TOKEN")
        .env_remove("MYKAOYAN_ORIGIN")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"fictional-agent-credential\n")
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    assert_eq!(
        serde_json::from_slice::<Value>(&output.stdout).unwrap(),
        json!({"saved":true})
    );
    assert!(!String::from_utf8_lossy(&output.stdout).contains("fictional-agent-credential"));
}

#[test]
fn argument_errors_are_machine_readable_and_offline_needs_no_auth() {
    let dir = tempfile::tempdir().unwrap();
    let result = cli(dir.path(), &["--json", "progress", "missing"]);
    assert_eq!(result.status.code(), Some(2));
    assert!(result.stdout.is_empty());
    assert!(serde_json::from_slice::<Value>(&result.stderr).unwrap()["error"].is_string());
    let result = cli(
        dir.path(),
        &[
            "--json",
            "--origin",
            "http://example.invalid",
            "progress",
            "pull",
            "unused.json",
        ],
    );
    assert_eq!(result.status.code(), Some(1));
    assert!(!dir.path().join("unused.json").exists());
}

#[cfg(unix)]
#[test]
fn saved_credentials_are_private_and_overpermissive_files_are_rejected() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tempfile::tempdir().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["login", "--token-stdin"])
        .env("HOME", dir.path())
        .env("XDG_CONFIG_HOME", dir.path())
        .env_remove("MYKAOYAN_ORIGIN")
        .env_remove("MYKAOYAN_TOKEN")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"fictional-agent-credential\n")
        .unwrap();
    assert!(child.wait().unwrap().success());
    let parent = if cfg!(target_os = "macos") {
        dir.path().join("Library/Application Support/mykaoyan")
    } else {
        dir.path().join("mykaoyan")
    };
    let file = parent.join("config.json");
    assert_eq!(
        std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(
        std::fs::metadata(&parent).unwrap().permissions().mode() & 0o777,
        0o700
    );
    std::fs::set_permissions(file, std::fs::Permissions::from_mode(0o644)).unwrap();
    let result = cli(dir.path(), &["--json", "progress", "pull", "unused.json"]);
    assert_eq!(result.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&result.stderr).contains("权限过宽"));
}

#[test]
fn accidental_credential_argument_is_never_echoed() {
    let dir = tempfile::tempdir().unwrap();
    for args in [
        vec!["login", "fictional-secret-marker"],
        vec!["--json", "login", "fictional-secret-marker"],
    ] {
        let output = cli(dir.path(), &args);
        assert_eq!(output.status.code(), Some(2));
        assert!(!String::from_utf8_lossy(&output.stderr).contains("fictional-secret-marker"));
        assert!(output.stdout.is_empty());
    }
}

#[test]
fn schema_integer_accepts_decimal_and_exponent_notation() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("decimal.json");
    let source=include_str!("../../skills/mykaoyan/templates/progress.v1.json").replace("\"revision\": 0", "\"revision\": 0.0").replace("\"daily\": []", "\"daily\": [{\"date\":\"2030-01-01\",\"minutes\":{\"302\":45e0},\"done\":\"\",\"tomorrowTop\":\"\",\"retro\":\"\"}]");
    std::fs::write(&file, source).unwrap();
    let output = cli(
        dir.path(),
        &["--json", "progress", "validate", file.to_str().unwrap()],
    );
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
