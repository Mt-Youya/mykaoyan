//! 命令行接口：只描述参数，不包含任何业务逻辑。

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(version, about = "我的考研：用 Agent 令牌读写本人的进度文件")]
pub(crate) struct Args {
    #[arg(long, global = true)]
    pub(crate) json: bool,
    #[arg(long, global = true)]
    pub(crate) origin: Option<String>,
    #[command(subcommand)]
    pub(crate) command: Commands,
}

#[derive(Subcommand)]
pub(crate) enum Commands {
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
    /// 把一份 Markdown 发布为讲义（速查表、自编题面）；不会改变上架状态
    PublishHandout {
        file: PathBuf,
        #[arg(long)]
        subject: String,
        #[arg(long)]
        slug: String,
        #[arg(long)]
        title: String,
        #[arg(long, default_value_t = 1)]
        position: u32,
        #[arg(long)]
        dry_run: bool,
    },
    /// 从结构化 JSON 发布一套真题试卷（题面与答案）；不会改变上架状态
    PublishPaper {
        file: PathBuf,
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
pub(crate) enum Progress {
    /// 下载到新文件，同时保存 ETag
    Pull { file: PathBuf },
    /// 离线按公开契约校验，不需要登录
    Validate { file: PathBuf },
    /// 按拉取的 ETag 推送，成功后读回核对
    Push { file: PathBuf },
}
