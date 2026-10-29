mod config;
mod contract;
mod private_file;
mod progress;
mod publish;
mod publish_scan;
use clap::{Parser, Subcommand};
use serde_json::{Value, json};
use std::path::PathBuf;
#[derive(Parser)]
#[command(version, about = "我的考研：用 Agent 令牌读写本人的进度文件")]
struct Args {
    #[arg(long, global = true)]
    json: bool,
    #[arg(long, global = true)]
    origin: Option<String>,
    #[command(subcommand)]
    command: Commands,
}
#[derive(Subcommand)]
enum Commands {
    /// 保存 Agent 令牌（不是网页登录）
    Login {
        #[arg(long)]
        token_stdin: bool,
    },
    /// 从一章目录发布视频、字幕和讲稿；不会改变上架状态
    Publish {
        directory: PathBuf,
        #[arg(long)]
        dry_run: bool,
    },
    /// 下载、离线校验、整份替换进度文件
    Progress {
        #[command(subcommand)]
        command: Progress,
    },
}
#[derive(Subcommand)]
enum Progress {
    /// 下载到新文件，同时保存 ETag
    Pull { file: PathBuf },
    /// 离线按公开契约校验，不需要登录
    Validate { file: PathBuf },
    /// 按拉取的 ETag 推送，成功后读回核对
    Push { file: PathBuf },
}
fn run(args: &Args) -> anyhow::Result<Value> {
    let environment = std::env::var("MYKAOYAN_ORIGIN").ok();
    let origin = args.origin.as_deref().or(environment.as_deref());
    match &args.command {
        Commands::Publish { directory, dry_run } => publish::run(
            if *dry_run {
                None
            } else {
                Some(config::load(origin)?)
            },
            directory,
            *dry_run,
        ),
        Commands::Login { token_stdin } => config::login(origin, *token_stdin),
        Commands::Progress {
            command: Progress::Validate { file },
        } => {
            contract::read(file)?;
            Ok(json!({"valid":true}))
        }
        Commands::Progress {
            command: Progress::Pull { file },
        } => progress::pull(config::load(origin)?, file),
        Commands::Progress {
            command: Progress::Push { file },
        } => progress::push(config::load(origin)?, file),
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
