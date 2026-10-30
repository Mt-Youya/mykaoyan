//! 发布相关的公开契约校验。

use crate::support::schema::{self, generated};
use anyhow::{Context, Result};
use serde::de::DeserializeOwned;
use serde_json::Value;

fn validate_type<T: DeserializeOwned>(value: &Value, name: &str, invalid: &str) -> Result<()> {
    schema::validate(value, name, "发布数据不符合公开契约")?;
    serde_json::from_value::<T>(value.clone()).context(invalid.to_owned())?;
    Ok(())
}

pub(super) fn lesson(value: &Value) -> Result<()> {
    validate_type::<generated::PublishLesson>(value, "PublishLesson", "发布类型不匹配")
}

pub(super) fn prepared(value: &Value) -> Result<()> {
    validate_type::<generated::PublishPrepared>(value, "PublishPrepared", "发布计划类型无效")
}

pub(super) fn result(value: &Value) -> Result<()> {
    schema::validate(value, "PublishResult", "发布数据不符合公开契约")
}

pub(super) fn handout(value: &Value) -> Result<()> {
    validate_type::<generated::PublishHandout>(
        value,
        "PublishHandout",
        "讲义发布数据不符合公开契约",
    )
}

pub(super) fn handout_result(value: &Value) -> Result<()> {
    validate_type::<generated::PublishHandoutResult>(
        value,
        "PublishHandoutResult",
        "讲义发布结果不符合公开契约",
    )
}
