//! 预签名直传：只发送对象字节与服务器给定的请求头，不接触站点配置与令牌。

use super::scan::Lesson;
use anyhow::{Context, Result, bail};
use reqwest::blocking::Client;
use serde_json::Value;
use std::time::Duration;

pub(super) fn upload(plan: &Value, lesson: &Lesson, local: bool) -> Result<()> {
    // 上传客户端不接触 Config；预签名 URL 自带权限，不附加站点的 Agent 令牌。
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(1800))
        .build()?;
    for upload in plan["uploads"].as_array().context("缺少上传项")? {
        let path = match upload["kind"].as_str().context("缺少上传类型")? {
            "video" => &lesson.video,
            "subtitle" => &lesson.subtitle,
            _ => bail!("未知上传类型"),
        };
        let url = reqwest::Url::parse(upload["url"].as_str().context("缺少上传地址")?)
            .context("上传地址无效")?;
        if url.scheme() != "https"
            && !(local && url.scheme() == "http" && url.host_str() == Some("127.0.0.1"))
        {
            bail!("上传地址必须使用 HTTPS");
        }
        let mut request = client
            .put(url)
            .header("Content-Length", std::fs::metadata(path)?.len())
            .body(std::fs::File::open(path).context("无法打开待上传文件")?);
        for (name, value) in upload["headers"].as_object().context("缺少上传请求头")? {
            request = request.header(name, value.as_str().context("上传请求头无效")?);
        }
        let response = request
            .send()
            .map_err(|_| anyhow::anyhow!("对象上传失败；保留本地文件，不自动重试"))?;
        if !response.status().is_success() {
            bail!("对象上传失败，未登记讲；请重新发布");
        }
    }
    Ok(())
}
