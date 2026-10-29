mod api;
mod upload;

use crate::{config::Config, contract, publish_scan};
use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use std::path::Path;

pub fn run(config: Option<Config>, directory: &Path, dry_run: bool) -> Result<Value> {
    let chapter = publish_scan::scan(directory)?;
    for lesson in &chapter.lessons {
        contract::publish_lesson(&lesson.input)?;
    }
    if dry_run {
        return Ok(
            json!({"dryRun":true,"lessons":chapter.lessons.len(),"skipped":chapter.skipped}),
        );
    }
    let api = api::Api::new(config.context("需要登录")?)?;
    let mut results = Vec::new();
    for lesson in chapter.lessons {
        let plan = api.prepare(&lesson.input)?;
        let mut cleanup_pending = false;
        let unchanged = plan["unchanged"].as_bool().unwrap_or(false);
        if !unchanged {
            upload::upload(&plan, &lesson, api.local_uploads())?;
            let id = plan["id"].as_str().context("缺少发布计划标识")?;
            let completed = api.complete(id)?;
            cleanup_pending = completed["cleanupPending"].as_bool().unwrap_or(false);
        }
        let slug = lesson.input["slug"].as_str().context("缺少讲标识")?;
        let readback = api.readback(slug)?;
        if readback["contentHash"] != plan["contentHash"] {
            bail!("发布读回哈希不一致");
        }
        cleanup_pending |= readback["cleanupPending"].as_bool().unwrap_or(false);
        results.push(json!({"slug":slug,"unchanged":unchanged,"cleanupPending":cleanup_pending,"publicationId":plan["id"],"version":readback["version"],"listed":readback["listed"],"keys":readback["keys"]}));
    }
    Ok(json!({"published":results,"skipped":chapter.skipped}))
}
