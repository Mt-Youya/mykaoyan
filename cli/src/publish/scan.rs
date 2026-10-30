//! 章目录扫描：按「视频/字幕/讲稿」同名配对，排除答案类内容与不完整组合。

use anyhow::{Context, Result, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub(super) struct Lesson {
    pub(super) input: Value,
    pub(super) video: PathBuf,
    pub(super) subtitle: PathBuf,
}

pub(super) struct Chapter {
    pub(super) lessons: Vec<Lesson>,
    pub(super) skipped: Vec<String>,
}

fn excluded(name: &str) -> bool {
    let name = name.to_lowercase();
    ["答案", "解答", "真题", "answer", "solution", "m-p"]
        .iter()
        .any(|word| name.contains(word))
}

fn id(prefix: &str, text: &str) -> String {
    format!(
        "{prefix}-{}",
        &format!("{:x}", Sha256::digest(text.as_bytes()))[..24]
    )
}

fn digest(path: &Path) -> Result<Value> {
    if fs::symlink_metadata(path)
        .context("课程文件不存在")?
        .file_type()
        .is_symlink()
    {
        bail!("不读取课程符号链接");
    }
    let mut file = fs::File::open(path).context("无法打开课程文件")?;
    let size = file.metadata()?.len();
    if size == 0 || size > 5_000_000_000 {
        bail!("课程文件为空或超过单次上传限制");
    }
    let mut sha = Sha256::new();
    let mut md5 = md5::Md5::new();
    let mut bytes = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut bytes).context("读取课程文件失败")?;
        if count == 0 {
            break;
        }
        sha.update(&bytes[..count]);
        md5.update(&bytes[..count]);
    }
    Ok(
        json!({"sha256":format!("{:x}",sha.finalize()),"md5":STANDARD.encode(md5.finalize()),"size":size}),
    )
}

pub(super) fn scan(directory: &Path) -> Result<Chapter> {
    if fs::symlink_metadata(directory)
        .context("章目录不存在")?
        .file_type()
        .is_symlink()
    {
        bail!("章目录不能是符号链接");
    }
    let directory = directory.canonicalize().context("无法读取章目录")?;
    let course = directory
        .ancestors()
        .find(|p| {
            matches!(
                p.file_name().and_then(|s| s.to_str()),
                Some("数学二" | "408")
            )
        })
        .context("章目录必须位于数学二或408目录下")?;
    let (subject, title) = if course.file_name().unwrap() == "数学二" {
        ("302", "数学（二）")
    } else {
        ("408", "计算机学科专业基础")
    };
    let relative = directory
        .strip_prefix(course)?
        .to_str()
        .context("目录名须为 UTF-8")?;
    if relative.is_empty() || relative.split('/').any(excluded) {
        bail!("不是可发布的章目录");
    }
    let chapter_slug = id(&format!("chapter-{subject}"), relative);
    let chapter_title = relative.replace(std::path::MAIN_SEPARATOR, " · ");
    let position = directory
        .file_name()
        .unwrap()
        .to_string_lossy()
        .split('-')
        .next()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);
    let mut videos = Vec::new();
    let mut skipped = Vec::new();
    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if excluded(&name) {
            skipped.push(name);
        }
    }
    for kind in ["视频", "字幕", "讲稿"] {
        let folder = directory.join(kind);
        if !folder.is_dir() {
            bail!("缺少视频、字幕或讲稿目录");
        }
        if fs::symlink_metadata(&folder)?.file_type().is_symlink() {
            bail!("课程子目录不能是符号链接");
        }
        for entry in fs::read_dir(folder)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if excluded(&name) || !path.is_file() || path.is_symlink() {
                skipped.push(format!("{kind}/{name}"));
                continue;
            }
            if kind == "视频" && path.extension().and_then(|v| v.to_str()) == Some("mp4") {
                videos.push(path);
            } else if kind == "视频"
                || !directory
                    .join("视频")
                    .join(format!(
                        "{}.mp4",
                        path.file_stem().unwrap().to_string_lossy()
                    ))
                    .is_file()
            {
                skipped.push(format!("{kind}/{name}"));
            }
        }
    }
    videos.sort();
    let mut lessons = Vec::new();
    for (index, video) in videos.into_iter().enumerate() {
        let stem = video
            .file_stem()
            .unwrap()
            .to_str()
            .context("文件名须为 UTF-8")?;
        let subtitle = directory.join("字幕").join(format!("{stem}.srt"));
        let script = directory.join("讲稿").join(format!("{stem}.md"));
        if !subtitle.is_file() || !script.is_file() {
            skipped.push(format!("视频/{stem}.mp4（缺少同名字幕或讲稿）"));
            continue;
        }
        if script.is_symlink() || subtitle.is_symlink() {
            bail!("讲稿与字幕不能是符号链接");
        }
        let script_text = fs::read_to_string(&script).context("讲稿必须为 UTF-8")?;
        if script_text.len() > 500_000 {
            bail!("讲稿超过大小限制");
        }
        let input = json!({"course":{"slug":format!("course-{subject}"),"title":title,"subjectCode":subject},"chapter":{"slug":chapter_slug,"title":chapter_title,"position":position},"slug":id(&format!("lesson-{subject}"),&format!("{relative}/{stem}")),"title":stem,"position":index,"scriptMarkdown":script_text,"video":digest(&video)?,"subtitle":digest(&subtitle)?});
        lessons.push(Lesson {
            input,
            video,
            subtitle,
        });
    }
    skipped.sort();
    if lessons.is_empty() {
        bail!("没有可发布的完整视频、字幕和讲稿组合");
    }
    Ok(Chapter { lessons, skipped })
}
