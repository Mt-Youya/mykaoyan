//! 进程外壳：解析参数、分发到 feature、决定输出与退出码。

mod auth;
mod cli;
mod progress;
mod publish;
mod support;

use anyhow::Result;
use clap::Parser;
use cli::{Args, Commands, Progress};
use serde_json::{Value, json};

fn run(args: &Args) -> Result<Value> {
    let environment = std::env::var("MYKAOYAN_ORIGIN").ok();
    let origin = args.origin.as_deref().or(environment.as_deref());
    match &args.command {
        Commands::Publish { directory, dry_run } => publish::run(
            if *dry_run {
                None
            } else {
                Some(auth::load(origin)?)
            },
            directory,
            *dry_run,
        ),
        Commands::PublishHandout {
            file,
            subject,
            slug,
            title,
            position,
            dry_run,
        } => publish::run_handout(
            if *dry_run {
                None
            } else {
                Some(auth::load(origin)?)
            },
            file,
            subject,
            slug,
            title,
            *position,
            *dry_run,
        ),
        Commands::Login { token_stdin } => auth::login(origin, *token_stdin),
        Commands::Progress { command } => match command {
            Progress::Validate { file } => progress::validate(file),
            Progress::Pull { file } => progress::pull(auth::load(origin)?, file),
            Progress::Push { file } => progress::push(auth::load(origin)?, file),
        },
    }
}

fn main() {
    let raw: Vec<_> = std::env::args_os().collect();
    let json_mode = raw.iter().any(|v| v == "--json");
    let args = match Args::try_parse_from(raw) {
        Ok(args) => args,
        Err(error) => {
            if error.exit_code() != 0 {
                if json_mode {
                    eprintln!("{}", json!({"error":"命令参数无效，请运行 --help"}));
                } else {
                    eprintln!(
                        "错误：命令参数无效，请运行 --help；Agent 令牌请通过交互或标准输入提供"
                    );
                }
                std::process::exit(2);
            }
            error.exit()
        }
    };
    match run(&args) {
        Ok(value) => {
            if args.json {
                println!("{value}");
            } else {
                println!("成功：{value}");
            }
        }
        Err(error) => {
            if args.json {
                eprintln!("{}", json!({"error":error.to_string()}));
            } else {
                eprintln!("错误：{error}");
            }
            std::process::exit(1);
        }
    }
}
