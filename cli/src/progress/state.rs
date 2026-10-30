//! 本地 ETag 边车：绑定站点与令牌摘要，避免跨站点、跨令牌复用版本基线。

use crate::{auth::Config, support::private_file};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize)]
pub(super) struct State {
    pub(super) origin: String,
    pub(super) credential_hash: String,
    pub(super) etag: String,
}

impl State {
    pub(super) fn for_config(config: &Config, etag: String) -> Self {
        Self {
            origin: config.origin.clone(),
            credential_hash: fingerprint(config),
            etag,
        }
    }

    pub(super) fn belongs_to(&self, config: &Config) -> bool {
        self.origin == config.origin && self.credential_hash == fingerprint(config)
    }
}

fn fingerprint(config: &Config) -> String {
    format!("{:x}", Sha256::digest(config.token.as_bytes()))
}

pub(super) fn path(file: &Path) -> PathBuf {
    let mut path = file.as_os_str().to_owned();
    path.push(".etag.json");
    path.into()
}

pub(super) fn read(file: &Path) -> Result<State> {
    serde_json::from_slice(&std::fs::read(path(file)).context("缺少 ETag 文件，请先拉取再推送")?)
        .context("ETag 文件格式无效")
}

// 只写边车；进度文件本身由 feature 编排层写入。
pub(super) fn write(file: &Path, state: &State) -> Result<()> {
    private_file::write(&path(file), &serde_json::to_vec(state)?)
}
