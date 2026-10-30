//! 进度文件的 HTTP 客户端：认证、状态码映射与「不自动重试」约定都集中在这里。
//! 响应必须是符合公开契约的进度文件，拉取与推送后的读回共用同一条校验路径。

use super::contract;
use crate::auth::Config;
use anyhow::{Context, Result, bail};
use reqwest::blocking::{Client, Response};
use serde_json::Value;
use std::time::Duration;

pub(super) struct Api {
    client: Client,
    config: Config,
}

fn checked(response: Response) -> Result<Response> {
    match response.status().as_u16() {
        200 => Ok(response),
        401 => bail!("HTTP 401：Agent 令牌缺失、无效或已吊销，请重新 login"),
        412 => bail!("HTTP 412：云端已修改，请先拉取到另一个文件，合并后再推送"),
        428 => bail!("HTTP 428：缺少 If-Match，请先拉取再推送"),
        status => bail!("HTTP {status}：请求失败，未自动重试"),
    }
}

impl Api {
    pub(super) fn new(config: Config) -> Result<Self> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .context("无法创建 HTTP 客户端")?;
        Ok(Self { client, config })
    }

    // 返回正文与原始 ETag；正文在这里就校验契约，调用方无需重复校验。
    pub(super) fn get(&self) -> Result<(Value, String)> {
        let response = checked(
            self.client
                .get(format!("{}/api/v1/progress", self.config.origin))
                .bearer_auth(&self.config.token)
                .send()
                .map_err(|_| anyhow::anyhow!("网络请求失败；不会自动重试"))?,
        )?;
        let etag = response
            .headers()
            .get("etag")
            .context("服务端缺少 ETag")?
            .to_str()
            .context("ETag 无效")?
            .to_owned();
        let value: Value = response
            .json()
            .map_err(|_| anyhow::anyhow!("服务端响应 JSON 无效"))?;
        contract::validate(&value)?;
        Ok((value, etag))
    }

    pub(super) fn put(&self, value: &Value, etag: &str) -> Result<Value> {
        let response = checked(
            self.client
                .put(format!("{}/api/v1/progress", self.config.origin))
                .bearer_auth(&self.config.token)
                .header("If-Match", etag)
                .json(value)
                .send()
                .map_err(|_| anyhow::anyhow!("推送结果未知，请先拉取到新文件核对；不会自动重试"))?,
        )?;
        let summary: Value = response
            .json()
            .map_err(|_| anyhow::anyhow!("推送响应无效，请拉取核对"))?;
        Ok(summary)
    }
}
