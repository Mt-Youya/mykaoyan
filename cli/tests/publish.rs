use serde_json::Value;
use std::process::Command;
fn chapter() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("数学二/01-虚构章");
    for part in ["视频", "字幕", "讲稿"] {
        std::fs::create_dir_all(root.join(part)).unwrap();
    }
    std::fs::write(root.join("视频/01-虚构讲.mp4"), b"fictional-video").unwrap();
    std::fs::write(root.join("字幕/01-虚构讲.srt"), b"fictional-subtitle").unwrap();
    std::fs::write(root.join("讲稿/01-虚构讲.md"), "虚构讲稿").unwrap();
    std::fs::write(root.join("视频/02-答案.mp4"), b"do-not-upload").unwrap();
    std::fs::write(root.join("讲稿/03-没有视频.md"), "虚构孤立讲稿").unwrap();
    std::fs::write(root.join("答案.md"), "do-not-read").unwrap();
    std::fs::create_dir(root.join("答案目录")).unwrap();
    dir
}
#[test]
fn dry_run_pairs_files_and_reports_excluded_and_incomplete_assets_without_auth() {
    let dir = chapter();
    let output = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args([
            "--json",
            "publish",
            dir.path().join("数学二/01-虚构章").to_str().unwrap(),
            "--dry-run",
        ])
        .env_remove("MYKAOYAN_TOKEN")
        .env_remove("MYKAOYAN_ORIGIN")
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let value: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(value["lessons"], 1);
    assert_eq!(value["skipped"].as_array().unwrap().len(), 4);
    assert!(!String::from_utf8_lossy(&output.stdout).contains("do-not-upload"));
}
#[cfg(unix)]
#[test]
fn rejects_symlinks_instead_of_scanning_arbitrary_content() {
    let dir = chapter();
    let root = dir.path().join("数学二/01-虚构章");
    std::fs::remove_file(root.join("讲稿/01-虚构讲.md")).unwrap();
    std::os::unix::fs::symlink("/etc/hosts", root.join("讲稿/01-虚构讲.md")).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "publish", root.to_str().unwrap(), "--dry-run"])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(!String::from_utf8_lossy(&output.stderr).contains("localhost"));
}

#[test]
fn rejects_unsupported_course_without_network_or_credentials() {
    let dir = chapter();
    std::fs::rename(dir.path().join("数学二"), dir.path().join("unsupported")).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_mykaoyan"))
        .args(["--json", "publish"])
        .arg(dir.path().join("unsupported/01-虚构章"))
        .arg("--dry-run")
        .env_remove("MYKAOYAN_TOKEN")
        .env_remove("MYKAOYAN_ORIGIN")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("数学二或408"));
}
