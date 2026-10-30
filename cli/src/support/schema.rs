//! 随包公开契约的通用加载与校验原语；要校验哪些组件由各 feature 的 contract 模块声明。

use anyhow::{Context, Result, bail};
use serde_json::Value;

#[allow(dead_code, clippy::all)]
pub(crate) mod generated {
    include!(concat!(env!("OUT_DIR"), "/contract.rs"));
}

fn api() -> Value {
    serde_json::from_str(include_str!("../../contracts/openapi.json")).expect("bundled contract")
}

// JSON Schema 的 integer 包含 45.0/45e0；仅给 serde 的副本规范化，原始 JSON 保持不变。
pub(crate) fn typed_value(value: &Value) -> Value {
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

pub(crate) fn validate(value: &Value, name: &str, invalid: &str) -> Result<()> {
    let schema = &api()["components"]["schemas"][name];
    let validator = jsonschema::validator_for(schema).context("随包公开契约无效")?;
    if !validator.is_valid(value) {
        bail!("{invalid}");
    }
    Ok(())
}
