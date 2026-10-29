use anyhow::{Context, Result, bail};
use serde::de::DeserializeOwned;
use serde_json::Value;
#[allow(dead_code, clippy::all)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/contract.rs"));
}
fn api() -> Value {
    serde_json::from_str(include_str!("../contracts/openapi.json")).expect("bundled contract")
}
// JSON Schema 的 integer 包含 45.0/45e0；仅给 serde 的副本规范化，原始 JSON 保持不变。
pub fn typed_value(value: &Value) -> Value {
    match value {
        Value::Number(number) if number.is_f64() => {
            let number = number.as_f64().unwrap();
            if number.fract() == 0.0 && number.abs() <= 9007199254740991.0 {
                Value::from(number as i64)
            } else {
                value.clone()
            }
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.clone(), typed_value(v)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(typed_value).collect()),
        _ => value.clone(),
    }
}
fn validate_schema(value: &Value, name: &str, invalid: &str) -> Result<()> {
    let schema = &api()["components"]["schemas"][name];
    let validator = jsonschema::validator_for(schema).context("随包公开契约无效")?;
    if !validator.is_valid(value) {
        bail!("{invalid}");
    }
    Ok(())
}

pub fn validate(value: &Value) -> Result<()> {
    validate_schema(value, "ProgressFile", "进度文件不符合公开契约 v1")?;
    let _: generated::ProgressFile =
        serde_json::from_value(typed_value(value)).context("进度文件类型无效")?;
    Ok(())
}

pub fn validate_summary(value: &Value) -> Result<()> {
    validate_schema(
        value,
        "ProgressChangeSummary",
        "推送摘要不符合公开契约，请拉取核对",
    )?;
    let _: generated::ProgressChangeSummary = serde_json::from_value(typed_value(value))
        .map_err(|_| anyhow::anyhow!("推送摘要无效，请拉取核对"))?;
    Ok(())
}

fn publish_type<T: DeserializeOwned>(value: &Value, name: &str, invalid: &str) -> Result<()> {
    validate_schema(value, name, "发布数据不符合公开契约")?;
    serde_json::from_value::<T>(value.clone()).context(invalid.to_owned())?;
    Ok(())
}

pub fn publish_lesson(value: &Value) -> Result<()> {
    publish_type::<generated::PublishLesson>(value, "PublishLesson", "发布类型不匹配")
}

pub fn publish_prepared(value: &Value) -> Result<()> {
    publish_type::<generated::PublishPrepared>(value, "PublishPrepared", "发布计划类型无效")
}

pub fn validate_publish_result(value: &Value) -> Result<()> {
    validate_schema(value, "PublishResult", "发布数据不符合公开契约")
}
pub fn read(path: &std::path::Path) -> Result<Value> {
    let value = serde_json::from_slice(&std::fs::read(path).context("无法读取进度文件")?)
        .map_err(|_| anyhow::anyhow!("进度文件 JSON 无效"))?;
    validate(&value)?;
    Ok(value)
}
