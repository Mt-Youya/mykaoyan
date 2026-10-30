//! Agent 令牌：登录保存、读取，以及站点地址与凭据文件权限校验。

use crate::support::private_file;
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{self, Read},
};

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Config {
    pub(crate) origin: String,
    pub(crate) token: String,
}

pub(crate) fn login(selected: Option<&str>, stdin: bool) -> Result<Value> {
    let selected = origin(selected.unwrap_or("https://mykaoyan.cn"))?;
    let token = if stdin {
        let mut value = String::new();
        io::stdin()
            .read_to_string(&mut value)
            .context("无法读取 Agent 令牌")?;
        value.trim().to_owned()
    } else {
        rpassword::prompt_password("Agent 令牌（不回显）：")
            .context("无法读取 Agent 令牌；自动化可用 --token-stdin")?
    };
    valid_token(&token)?;
    let path = path()?;
    fs::create_dir_all(path.parent().unwrap()).context("无法创建配置目录")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path.parent().unwrap(), fs::Permissions::from_mode(0o700))?;
    }
    private_file::write(
        &path,
        &serde_json::to_vec(&Config {
            origin: selected,
            token,
        })?,
    )?;
    Ok(serde_json::json!({"saved":true}))
}

pub(crate) fn load(selected: Option<&str>) -> Result<Config> {
    if let Some(token) = std::env::var_os("MYKAOYAN_TOKEN") {
        let token = token
            .into_string()
            .map_err(|_| anyhow::anyhow!("Agent 令牌格式无效"))?;
        valid_token(&token)?;
        return Ok(Config {
            origin: origin(selected.unwrap_or("https://mykaoyan.cn"))?,
            token,
        });
    }
    let path = path()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = fs::symlink_metadata(&path).context("请先运行 login 或设置 MYKAOYAN_TOKEN")?;
        if !meta.is_file() || meta.permissions().mode() & 0o077 != 0 {
            bail!("凭据文件权限过宽，需仅本人可读写");
        }
    }
    let config: Config =
        serde_json::from_slice(&fs::read(path).context("请先运行 login 或设置 MYKAOYAN_TOKEN")?)
            .context("配置格式无效")?;
    valid_token(&config.token)?;
    let stored = origin(&config.origin)?;
    if let Some(input) = selected
        && origin(input)? != stored
    {
        bail!("站点与已保存令牌不匹配，请为目标站点重新 login");
    }
    Ok(Config {
        origin: stored,
        ..config
    })
}

fn origin(input: &str) -> Result<String> {
    let url = reqwest::Url::parse(input).context("站点地址无效")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !(url.scheme() == "https" || (url.scheme() == "http" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        bail!("站点地址必须是 HTTPS 根地址；仅本地回环允许 HTTP");
    }
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

fn valid_token(token: &str) -> Result<()> {
    if token.is_empty() || token.chars().any(char::is_whitespace) || !token.is_ascii() {
        bail!("Agent 令牌为空或格式无效");
    }
    Ok(())
}

fn path() -> Result<std::path::PathBuf> {
    Ok(dirs::config_dir()
        .context("无法定位系统配置目录")?
        .join("mykaoyan/config.json"))
}
