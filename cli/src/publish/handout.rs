//! 讲义发布：一份 Markdown 单请求写入，不做对象上传。

use super::{api::Api, contract};
use crate::auth::Config;
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

const LIMIT: usize = 1_048_576;

fn excluded(name: &str) -> bool {
    let name = name.to_lowercase();
    ["答案", "解析", "answer", "solution"]
        .iter()
        .any(|word| name.contains(word))
}

fn content_hash(input: &Value) -> Result<String> {
    let subject = input["subjectCode"].as_str().context("缺少科目代码")?;
    let slug = input["slug"].as_str().context("缺少讲义标识")?;
    let title = input["title"].as_str().context("缺少标题")?;
    let position = input["position"].as_u64().context("缺少顺序")?;
    let markdown = input["markdown"].as_str().context("缺少 Markdown")?;
    let position = position.to_string();
    let mut hasher = Sha256::new();
    hasher.update(
        [subject, slug, title, position.as_str(), markdown]
            .join("\0")
            .as_bytes(),
    );
    Ok(format!("{:x}", hasher.finalize()))
}

fn read_markdown(path: &Path) -> Result<String> {
    if fs::symlink_metadata(path)
        .context("讲义文件不存在")?
        .file_type()
        .is_symlink()
    {
        bail!("不读取讲义符号链接");
    }
    let markdown = fs::read_to_string(path).context("讲义必须是 UTF-8 文本")?;
    if markdown.is_empty() || markdown.len() > LIMIT {
        bail!("讲义为空或超过 1 MiB 上限");
    }
    Ok(markdown)
}

pub(crate) fn run(
    config: Option<Config>,
    file: &Path,
    subject: &str,
    slug: &str,
    title: &str,
    position: u32,
    dry_run: bool,
) -> Result<Value> {
    let name = file
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if excluded(name) {
        bail!("不发布答案或解析类文件");
    }
    let markdown = read_markdown(file)?;
    let bytes = markdown.len();
    let input = json!({
        "subjectCode": subject,
        "slug": slug,
        "title": title,
        "position": position,
        "markdown": markdown,
    });
    contract::handout(&input)?;
    let content_hash = content_hash(&input)?;
    if dry_run {
        return Ok(json!({
            "dryRun": true,
            "slug": slug,
            "bytes": bytes,
            "contentHash": content_hash,
        }));
    }
    let api = Api::new(config.context("需要登录")?)?;
    let result = api.publish_handout(&input)?;
    contract::handout_result(&result)?;
    Ok(result)
}
