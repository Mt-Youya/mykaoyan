//! 进度文件与推送摘要的公开契约校验。

use crate::support::schema::{self, generated};
use anyhow::{Context, Result};
use serde_json::Value;
use std::path::Path;

pub(super) fn validate(value: &Value) -> Result<()> {
    schema::validate(value, "ProgressFile", "进度文件不符合公开契约 v1")?;
    let _: generated::ProgressFile =
        serde_json::from_value(schema::typed_value(value)).context("进度文件类型无效")?;
    Ok(())
}

pub(super) fn validate_summary(value: &Value) -> Result<()> {
    schema::validate(
        value,
        "ProgressChangeSummary",
        "推送摘要不符合公开契约，请拉取核对",
    )?;
    let _: generated::ProgressChangeSummary = serde_json::from_value(schema::typed_value(value))
        .map_err(|_| anyhow::anyhow!("推送摘要无效，请拉取核对"))?;
    Ok(())
}

pub(super) fn read(path: &Path) -> Result<Value> {
    let value = serde_json::from_slice(&std::fs::read(path).context("无法读取进度文件")?)
        .map_err(|_| anyhow::anyhow!("进度文件 JSON 无效"))?;
    validate(&value)?;
    Ok(value)
}

// 读回比较忽略 JSON 数字表示差异：契约里的 integer 允许 45 与 45.0。
pub(super) fn same_data(left: &Value, right: &Value) -> bool {
    schema::typed_value(&left["data"]) == schema::typed_value(&right["data"])
}
