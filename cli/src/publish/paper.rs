//! 试卷发布：结构化 JSON 单请求写入；答案只经登录后的服务端接口读取。

use super::{api::Api, contract};
use crate::auth::Config;
use crate::support::schema::typed_value;
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

const LIMIT: usize = 4 * 1024 * 1024;

fn read_paper(path: &Path) -> Result<Value> {
    if fs::symlink_metadata(path)
        .context("试卷文件不存在")?
        .file_type()
        .is_symlink()
    {
        bail!("不读取试卷符号链接");
    }
    let bytes = fs::read(path).context("无法读取试卷文件")?;
    if bytes.is_empty() || bytes.len() > LIMIT {
        bail!("试卷文件为空或超过 4 MiB 上限");
    }
    serde_json::from_slice(&bytes).context("试卷必须是合法 JSON")
}

fn validate_questions(input: &Value) -> Result<()> {
    let questions = input["questions"].as_array().context("缺少题目数组")?;
    let mut previous = 0;
    for question in questions {
        let number = question["number"].as_u64().context("题号无效")?;
        if number <= previous {
            bail!("题号必须唯一且严格升序");
        }
        previous = number;
        let kind = question["type"].as_str().unwrap_or_default();
        let choice = kind == "单选" || kind == "多选";
        let has_options = question
            .get("options")
            .is_some_and(|value| !value.is_null());
        if choice && !has_options {
            bail!("选择题必须有选项");
        }
        if !choice && has_options {
            bail!("非选择题不得带选项");
        }
    }
    Ok(())
}

fn content_hash(input: &Value) -> Result<String> {
    let canonical = typed_value(input);
    let text = serde_json::to_string(&canonical).context("试卷无法规范化")?;
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    Ok(format!("{:x}", hasher.finalize()))
}

pub(crate) fn run(config: Option<Config>, file: &Path, dry_run: bool) -> Result<Value> {
    let input = read_paper(file)?;
    contract::paper(&input)?;
    validate_questions(&input)?;
    let content_hash = content_hash(&input)?;
    let slug = input["slug"].as_str().context("缺少试卷标识")?;
    let question_count = input["questions"]
        .as_array()
        .map(|items| items.len())
        .unwrap_or(0);
    if dry_run {
        return Ok(json!({
            "dryRun": true,
            "slug": slug,
            "questions": question_count,
            "bytes": fs::metadata(file)?.len(),
            "contentHash": content_hash,
        }));
    }
    let api = Api::new(config.context("需要登录")?)?;
    let result = api.publish_paper(&input)?;
    contract::paper_result(&result)?;
    Ok(result)
}
