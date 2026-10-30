//! 进度文件 feature：下载、离线校验、整份替换推送。

mod api;
mod contract;
mod state;

use crate::{auth::Config, support::private_file};
use anyhow::{Result, bail};
use serde_json::{Value, json};
use std::path::Path;

pub(crate) fn validate(file: &Path) -> Result<Value> {
    contract::read(file)?;
    Ok(json!({"valid":true}))
}

pub(crate) fn pull(config: Config, file: &Path) -> Result<Value> {
    // 拉取只创建新文件，避免覆盖尚未上传的本地编辑。
    if file.exists() || state::path(file).exists() {
        bail!("目标文件已存在，请拉取到新文件后比较合并");
    }
    let (value, etag) = api::Api::new(config.clone())?.get()?;
    save(
        file,
        &value,
        &state::State::for_config(&config, etag.clone()),
    )?;
    Ok(json!({"saved":true,"etag":etag}))
}

pub(crate) fn push(config: Config, file: &Path) -> Result<Value> {
    let value = contract::read(file)?;
    let sidecar = state::read(file)?;
    if !sidecar.belongs_to(&config) {
        bail!("ETag 不属于当前站点或令牌，请先拉取再合并");
    }
    if sidecar.etag.is_empty() || sidecar.etag == "*" {
        bail!("ETag 无效，请先拉取");
    }
    let api = api::Api::new(config.clone())?;
    let summary = api.put(&value, &sidecar.etag)?;
    contract::validate_summary(&summary)?;
    let (readback, etag) = api.get()?;
    if !contract::same_data(&readback, &value) || summary["etag"] != etag {
        bail!("推送后读回不一致，请拉取到新文件核对；保留本地文件");
    }
    save(file, &readback, &state::State::for_config(&config, etag))?;
    Ok(summary)
}

// 先写进度文件、再写边车；两步都成功后才更新本地版本基线。
fn save(file: &Path, value: &Value, sidecar: &state::State) -> Result<()> {
    private_file::write(file, &serde_json::to_vec_pretty(value)?)?;
    state::write(file, sidecar)
}
