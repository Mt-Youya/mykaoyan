//! 发布接口客户端：prepare、complete、读回。错误只映射为可读提示，不自动重试。

use super::contract;
use crate::auth::Config;
use anyhow::{Context, Result, bail};
use reqwest::blocking::{Client, Response};
use serde_json::{Value, json};
use std::time::Duration;

pub(super) struct Api {
    client: Client,
    config: Config,
}

fn checked(response: Response) -> Result<Value> {
    match response.status().as_u16() {
        200 | 201 => response
            .json()
            .map_err(|_| anyhow::anyhow!("发布响应不是合法 JSON")),
        400 => bail!("发布内容无效；未自动重试"),
        401 | 403 => bail!("需要管理员发布令牌，请以 scope=publish 创建后重新 login"),
        409 => bail!("发布冲突或对象校验失败，请重新检查发布计划；未自动重试"),
        status => bail!("HTTP {status}：发布请求失败；未自动重试"),
    }
}

impl Api {
    pub(super) fn new(config: Config) -> Result<Self> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(1800))
            .build()?;
        Ok(Self { client, config })
    }

    pub(super) fn prepare(&self, input: &Value) -> Result<Value> {
        let plan = checked(
            self.client
                .post(format!("{}/api/v1/publish/prepare", self.config.origin))
                .bearer_auth(&self.config.token)
                .json(input)
                .send()
                .map_err(|_| anyhow::anyhow!("发布计划请求失败"))?,
        )?;
        contract::prepared(&plan)?;
        Ok(plan)
    }

    pub(super) fn complete(&self, id: &str) -> Result<Value> {
        let result = checked(
            self.client
                .post(format!(
                    "{}/api/v1/publish/{id}/complete",
                    self.config.origin
                ))
                .bearer_auth(&self.config.token)
                .json(&json!({}))
                .send()
                .map_err(|_| anyhow::anyhow!("登记结果未知，请读回核对或重新发布；不自动重试"))?,
        )?;
        contract::result(&result)?;
        Ok(result)
    }

    pub(super) fn readback(&self, slug: &str) -> Result<Value> {
        let result = checked(
            self.client
                .get(format!(
                    "{}/api/v1/publish/lessons/{slug}",
                    self.config.origin
                ))
                .bearer_auth(&self.config.token)
                .send()
                .map_err(|_| anyhow::anyhow!("发布读回失败"))?,
        )?;
        contract::result(&result)?;
        Ok(result)
    }

    pub(super) fn publish_handout(&self, input: &Value) -> Result<Value> {
        let slug = input["slug"].as_str().context("缺少讲义标识")?;
        checked(
            self.client
                .put(format!(
                    "{}/api/v1/publish/handouts/{slug}",
                    self.config.origin
                ))
                .bearer_auth(&self.config.token)
                .json(input)
                .send()
                .map_err(|_| anyhow::anyhow!("讲义发布请求失败；未自动重试"))?,
        )
    }

    pub(super) fn publish_paper(&self, input: &Value) -> Result<Value> {
        let slug = input["slug"].as_str().context("缺少试卷标识")?;
        checked(
            self.client
                .put(format!(
                    "{}/api/v1/publish/papers/{slug}",
                    self.config.origin
                ))
                .bearer_auth(&self.config.token)
                .json(input)
                .send()
                .map_err(|_| anyhow::anyhow!("试卷发布请求失败；未自动重试"))?,
        )
    }

    pub(super) fn local_uploads(&self) -> bool {
        self.config.origin.starts_with("http://127.0.0.1:")
    }
}
