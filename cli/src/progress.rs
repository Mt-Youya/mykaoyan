use crate::{config::Config, contract, private_file};
use anyhow::{Context, Result, bail};
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Serialize, Deserialize)]
struct State {
    origin: String,
    credential_hash: String,
    etag: String,
}
fn state_path(file: &Path) -> PathBuf {
    let mut path = file.as_os_str().to_owned();
    path.push(".etag.json");
    path.into()
}
fn fingerprint(config: &Config) -> String {
    format!("{:x}", Sha256::digest(config.token.as_bytes()))
}
fn client() -> Result<Client> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .context("无法创建 HTTP 客户端")
}
fn check(response: Response) -> Result<Response> {
    match response.status().as_u16() {
        200 => Ok(response),
        401 => bail!("HTTP 401：Agent 令牌缺失、无效或已吊销，请重新 login"),
        412 => bail!("HTTP 412：云端已修改，请先拉取到另一个文件，合并后再推送"),
        428 => bail!("HTTP 428：缺少 If-Match，请先拉取再推送"),
        status => bail!("HTTP {status}：请求失败，未自动重试"),
    }
}
fn get(client: &Client, config: &Config) -> Result<(Value, String)> {
    let response = check(
        client
            .get(format!("{}/api/v1/progress", config.origin))
            .bearer_auth(&config.token)
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
fn save(file: &Path, value: &Value, etag: String, config: &Config) -> Result<()> {
    private_file::write(file, &serde_json::to_vec_pretty(value)?)?;
    private_file::write(
        &state_path(file),
        &serde_json::to_vec(&State {
            origin: config.origin.clone(),
            credential_hash: fingerprint(config),
            etag,
        })?,
    )?;
    Ok(())
}
pub fn pull(config: Config, file: &Path) -> Result<Value> {
    // 拉取只创建新文件，避免覆盖尚未上传的本地编辑。
    if file.exists() || state_path(file).exists() {
        bail!("目标文件已存在，请拉取到新文件后比较合并");
    }
    let (value, etag) = get(&client()?, &config)?;
    save(file, &value, etag.clone(), &config)?;
    Ok(json!({"saved":true,"etag":etag}))
}
pub fn push(config: Config, file: &Path) -> Result<Value> {
    let value = contract::read(file)?;
    let state: State = serde_json::from_slice(
        &std::fs::read(state_path(file)).context("缺少 ETag 文件，请先拉取再推送")?,
    )
    .context("ETag 文件格式无效")?;
    if state.origin != config.origin || state.credential_hash != fingerprint(&config) {
        bail!("ETag 不属于当前站点或令牌，请先拉取再合并");
    }
    if state.etag.is_empty() || state.etag == "*" {
        bail!("ETag 无效，请先拉取");
    }
    let client = client()?;
    let response = check(
        client
            .put(format!("{}/api/v1/progress", config.origin))
            .bearer_auth(&config.token)
            .header("If-Match", &state.etag)
            .json(&value)
            .send()
            .map_err(|_| anyhow::anyhow!("推送结果未知，请先拉取到新文件核对；不会自动重试"))?,
    )?;
    let summary: Value = response
        .json()
        .map_err(|_| anyhow::anyhow!("推送响应无效，请拉取核对"))?;
    contract::validate_summary(&summary)?;
    let (readback, etag) = get(&client, &config)?;
    if contract::typed_value(&readback["data"]) != contract::typed_value(&value["data"])
        || summary["etag"] != etag
    {
        bail!("推送后读回不一致，请拉取到新文件核对；保留本地文件");
    }
    save(file, &readback, etag, &config)?;
    Ok(summary)
}
