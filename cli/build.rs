use std::{env, fs, path::PathBuf};
// typify 将纯字符串 anyOf 生成为结构体；表示为 String，约束仍由原始 schema 验证。
fn string_unions(value: &mut serde_json::Value) {
    if let Some(branches) = value.get("anyOf").and_then(|v| v.as_array())
        && branches
            .iter()
            .all(|v| v.get("type").and_then(|v| v.as_str()) == Some("string"))
    {
        value.as_object_mut().unwrap().remove("anyOf");
        value["type"] = "string".into();
    }
    match value {
        serde_json::Value::Object(map) => map.values_mut().for_each(string_unions),
        serde_json::Value::Array(list) => list.iter_mut().for_each(string_unions),
        _ => (),
    }
}
fn main() {
    println!("cargo:rerun-if-changed=contracts/openapi.json");
    let api: serde_json::Value =
        serde_json::from_str(&fs::read_to_string("contracts/openapi.json").unwrap()).unwrap();
    let mut types = typify::TypeSpace::default();
    for name in [
        "ProgressFile",
        "ProgressChangeSummary",
        "PublishLesson",
        "PublishPrepared",
        "PublishResult",
    ] {
        let mut schema = api["components"]["schemas"][name].clone();
        schema["title"] = name.into();
        string_unions(&mut schema);
        types
            .add_root_schema(serde_json::from_value(schema).unwrap())
            .unwrap();
    }
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    fs::write(output.join("contract.rs"), types.to_stream().to_string()).unwrap();
}
